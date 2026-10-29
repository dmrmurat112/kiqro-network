import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { formatMicros } from '@kiqro/core';
import { getAccountId, newId, postTransaction, schema, topUpAdvertiser, type Db, type DbOrTx } from '@kiqro/db';
import { enqueueEmail } from '../email/queue.ts';

const { advertiserUsers, invoices, organizations, payments } = schema;

export type Payment = typeof payments.$inferSelect;

/** Smallest self-serve top-up (spec decision K-9). Paying an invoice may be any amount. */
export const MIN_TOPUP_USD = '500';
/** Larger amounts go by bank transfer: card fees grow with the amount and Stripe reviews big charges. */
export const MAX_CARD_TOPUP_USD = '50000';

const money = (micros: bigint) => `$${formatMicros(micros)}`;

/** Applies paid-in money to the advertiser's open invoices, oldest first. */
async function applyToInvoices(tx: DbOrTx, orgId: string, amount: bigint, now: Date): Promise<void> {
  const open = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.status, 'open')))
    .orderBy(asc(invoices.issuedAt))
    .for('update');
  let left = amount;
  for (const invoice of open) {
    if (left <= 0n) break;
    const due = invoice.amount - invoice.amountPaid;
    const pay = left < due ? left : due;
    left -= pay;
    const paidInFull = pay === due;
    await tx
      .update(invoices)
      .set({ amountPaid: invoice.amountPaid + pay, status: paidInFull ? 'paid' : 'open', paidAt: paidInFull ? now : null })
      .where(eq(invoices.id, invoice.id));
  }
}

async function notifyPaymentReceived(tx: DbOrTx, payment: Payment, advertiseBaseUrl: string, now: Date): Promise<void> {
  const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, payment.orgId) });
  const users = await tx.select().from(advertiserUsers).where(and(eq(advertiserUsers.orgId, payment.orgId), isNull(advertiserUsers.disabledAt)));
  for (const user of users) {
    await enqueueEmail(
      tx,
      user.email,
      {
        name: 'payment_received',
        data: {
          name: user.name,
          company: org!.name,
          amount: money(payment.amount),
          method: payment.method,
          paymentId: payment.id,
          billingLink: `${advertiseBaseUrl.replace(/\/$/, '')}/app/billing`,
        },
      },
      user.locale === 'tr' ? 'tr' : 'en',
      now,
    );
  }
}

/**
 * Turns a pending payment into balance: ledger top-up, payment marked succeeded, money applied to
 * open invoices, receipt e-mail. Must run inside a transaction holding the payment row lock.
 */
async function settle(tx: DbOrTx, payment: Payment, advertiseBaseUrl: string, now: Date): Promise<void> {
  const ledgerTransactionId = await topUpAdvertiser(tx, payment.orgId, payment.amount, `${payment.method} ${payment.id}`);
  await tx.update(payments).set({ status: 'succeeded', ledgerTransactionId, completedAt: now }).where(eq(payments.id, payment.id));
  await applyToInvoices(tx, payment.orgId, payment.amount, now);
  await notifyPaymentReceived(tx, { ...payment, status: 'succeeded' }, advertiseBaseUrl, now);
}

/** Records money that has already arrived (bank transfer recorded by Kiqro finance). */
export async function recordReceivedPayment(
  tx: DbOrTx,
  input: { orgId: string; amount: bigint; method: 'bank_transfer' | 'other'; reference: string; adminUserId: string },
  advertiseBaseUrl: string,
  now = new Date(),
): Promise<string> {
  const id = newId('payment');
  await tx.insert(payments).values({ id, orgId: input.orgId, method: input.method, amount: input.amount, reference: input.reference, adminUserId: input.adminUserId, createdAt: now });
  const [payment] = await tx.select().from(payments).where(eq(payments.id, id));
  await settle(tx, payment!, advertiseBaseUrl, now);
  return id;
}

/** A Stripe Checkout Session as delivered in webhook events (only the fields Kiqro uses). */
export interface StripeCheckoutSession {
  id: string;
  amount_total: number | null;
  currency: string | null;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
}

export type CheckoutOutcome = 'credited' | 'already_processed' | 'not_paid' | 'unknown_payment' | 'amount_mismatch';

/**
 * Credits a completed Stripe Checkout. Idempotent: Stripe retries webhooks and may deliver
 * both "completed" and "async_payment_succeeded", but a payment is credited once.
 */
export async function completeStripeCheckout(db: Db, session: StripeCheckoutSession, advertiseBaseUrl: string, now = new Date()): Promise<CheckoutOutcome> {
  if (session.payment_status !== 'paid') return 'not_paid';
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.stripeSessionId, session.id)).for('update');
    if (!payment) return 'unknown_payment';
    if (payment.status === 'succeeded') return 'already_processed';
    // Never credit more (or less) than what was actually charged.
    if (session.currency !== 'usd' || BigInt(session.amount_total ?? -1) * 10_000n !== payment.amount) return 'amount_mismatch';
    await tx.update(payments).set({ stripePaymentIntentId: session.payment_intent ?? null }).where(eq(payments.id, payment.id));
    await settle(tx, payment, advertiseBaseUrl, now);
    return 'credited';
  });
}

/** A refunded Stripe charge as delivered in "charge.refunded" events (fields Kiqro uses). */
export interface StripeRefundedCharge {
  payment_intent: string | null;
  amount_refunded: number; // cumulative, cents
  currency: string;
}

export type RefundOutcome = 'debited' | 'already_processed' | 'unknown_payment';

/**
 * Takes a Stripe refund off the advertiser's balance. Stripe reports the cumulative refunded
 * amount, so partial refunds and webhook retries only ever debit the difference.
 */
export async function applyStripeRefund(db: Db, charge: StripeRefundedCharge): Promise<RefundOutcome> {
  if (!charge.payment_intent || charge.currency !== 'usd') return 'unknown_payment';
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.stripePaymentIntentId, charge.payment_intent!)).for('update');
    if (!payment || payment.status !== 'succeeded') return 'unknown_payment';
    const refunded = BigInt(charge.amount_refunded) * 10_000n;
    const delta = (refunded > payment.amount ? payment.amount : refunded) - payment.refundedAmount;
    if (delta <= 0n) return 'already_processed';
    await postTransaction(tx, {
      type: 'advertiser_refund',
      refType: 'payment',
      refId: payment.id,
      memo: `stripe refund ${payment.id}`,
      entries: [
        { accountId: await getAccountId(tx, 'advertiser_balance', payment.orgId), amount: -delta },
        { accountId: await getAccountId(tx, 'external_cash', null), amount: delta },
      ],
    });
    await tx.update(payments).set({ refundedAmount: payment.refundedAmount + delta }).where(eq(payments.id, payment.id));
    return 'debited';
  });
}

/** An abandoned or failed checkout: the payment stays in history but never becomes balance. */
export async function closeStripeCheckout(db: Db, sessionId: string, status: 'expired' | 'failed', now = new Date()): Promise<void> {
  await db
    .update(payments)
    .set({ status, completedAt: now })
    .where(and(eq(payments.stripeSessionId, sessionId), eq(payments.status, 'pending')));
}

export async function listPayments(db: DbOrTx, orgId: string, limit = 50) {
  return db.select().from(payments).where(eq(payments.orgId, orgId)).orderBy(desc(payments.createdAt)).limit(limit);
}

export async function listInvoices(db: DbOrTx, orgId: string) {
  return db.select().from(invoices).where(eq(invoices.orgId, orgId)).orderBy(desc(invoices.issuedAt));
}

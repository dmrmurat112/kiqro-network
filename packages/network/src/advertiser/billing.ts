import { and, eq } from 'drizzle-orm';
import { parseMicros } from '@kiqro/core';
import { newId, schema, type Db } from '@kiqro/db';
import { creditPosition } from '../billing/credit.ts';
import { closeStripeCheckout, completeStripeCheckout, listInvoices, listPayments, MAX_CARD_TOPUP_USD, MIN_TOPUP_USD, type Payment } from '../billing/payments.ts';
import { StripeError, type PaymentGateway } from '../billing/stripe.ts';
import { translateMessage, type UiLocale } from '../validation.ts';
import type { AdvertiserSession, LinkOptions } from './auth.ts';

const { invoices, payments } = schema;

export type TopUpResult = { ok: true; url: string } | { ok: false; message: string };

/** Everything the Billing page shows. */
export async function billingOverview(db: Db, orgId: string, now = new Date()) {
  const [position, paymentRows, invoiceRows] = await Promise.all([creditPosition(db, orgId, now), listPayments(db, orgId), listInvoices(db, orgId)]);
  return { position, payments: paymentRows, invoices: invoiceRows.map((i) => ({ ...i, overdue: i.status === 'open' && i.dueAt < now })) };
}

/**
 * Starts a card payment: records a pending payment and returns the Stripe Checkout URL. The
 * balance changes only when Stripe confirms the payment (webhook), never on the redirect back.
 * With `invoiceId` the amount is what is left to pay on that invoice; otherwise the advertiser's
 * amount, at least MIN_TOPUP_USD.
 */
export async function startTopUp(
  db: Db,
  session: AdvertiserSession,
  input: { amountUsd?: string; invoiceId?: string },
  gateway: PaymentGateway | null,
  opts: LinkOptions,
  locale: UiLocale,
): Promise<TopUpResult> {
  const fail = (key: string): TopUpResult => ({ ok: false, message: translateMessage(key, locale) });
  if (!gateway) return fail('payments_unavailable');

  let amount: bigint;
  let invoiceId: string | null = null;
  if (input.invoiceId) {
    const invoice = await db.query.invoices.findFirst({ where: and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, session.org.id)) });
    if (!invoice || invoice.status !== 'open') return fail('invoice_not_payable');
    amount = invoice.amount - invoice.amountPaid;
    // Card payments are in whole cents; round a sub-cent remainder up.
    amount = ((amount + 9_999n) / 10_000n) * 10_000n;
    invoiceId = invoice.id;
  } else {
    const raw = (input.amountUsd ?? '').trim().replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return fail('amount_cents');
    amount = parseMicros(raw);
    if (amount < parseMicros(MIN_TOPUP_USD)) return fail(`topup_minimum|${MIN_TOPUP_USD}`);
  }
  if (amount > parseMicros(MAX_CARD_TOPUP_USD)) return fail(`topup_maximum|${MAX_CARD_TOPUP_USD}`);

  const paymentId = newId('payment');
  await db.insert(payments).values({ id: paymentId, orgId: session.org.id, method: 'stripe', amount, invoiceId, advertiserUserId: session.user.id });
  const base = opts.advertiseBaseUrl.replace(/\/$/, '');
  try {
    const checkout = await gateway.createCheckout({
      paymentId,
      orgId: session.org.id,
      amountCents: Number(amount / 10_000n),
      description: locale === 'tr' ? `Kiqro Network bakiye yükleme — ${session.org.name}` : `Kiqro Network balance top-up — ${session.org.name}`,
      customerEmail: session.user.email,
      locale,
      successUrl: `${base}/app/billing?paid=${paymentId}`,
      cancelUrl: `${base}/app/billing?canceled=1`,
    });
    await db.update(payments).set({ stripeSessionId: checkout.id }).where(eq(payments.id, paymentId));
    return { ok: true, url: checkout.url };
  } catch (e) {
    await db.update(payments).set({ status: 'failed', completedAt: new Date() }).where(eq(payments.id, paymentId));
    console.error('checkout failed', e instanceof StripeError ? e.message : e);
    return fail('payments_unavailable');
  }
}

/** A payment of this advertiser, for the "thank you" notice after Stripe redirects back. */
export async function advertiserPayment(db: Db, orgId: string, paymentId: string) {
  return db.query.payments.findFirst({ where: and(eq(payments.id, paymentId), eq(payments.orgId, orgId)) });
}

/**
 * Settles a checkout of the dev gateway (local development without Stripe keys) the way the
 * Stripe webhook would. Callers must only offer this when the dev gateway is in use.
 */
export async function settleDevCheckout(db: Db, orgId: string, sessionId: string, outcome: 'paid' | 'canceled', advertiseBaseUrl: string): Promise<Payment | undefined> {
  const payment = await db.query.payments.findFirst({ where: and(eq(payments.stripeSessionId, sessionId), eq(payments.orgId, orgId)) });
  if (!payment || !sessionId.startsWith('cs_dev_')) return undefined;
  if (outcome === 'paid') {
    await completeStripeCheckout(db, { id: sessionId, amount_total: Number(payment.amount / 10_000n), currency: 'usd', payment_status: 'paid', payment_intent: null }, advertiseBaseUrl);
  } else {
    await closeStripeCheckout(db, sessionId, 'expired');
  }
  return payment;
}

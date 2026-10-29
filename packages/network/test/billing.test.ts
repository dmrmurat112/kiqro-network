import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAccountId, getBalance, postTransaction, schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createAdminUser, createAdvertiser, recordTopUp, setCreditTerms, AdminError, type AdminUser } from '../src/admin/index.ts';
import { advertiserLogin, billingOverview, createAdvertiserUser, getAdvertiserSession, setPasswordWithToken, startTopUp, type AdvertiserSession } from '../src/advertiser/index.ts';
import {
  closeStripeCheckout,
  completeStripeCheckout,
  creditPosition,
  issueMonthlyInvoices,
  remindOverdueInvoices,
  signStripePayload,
  stripeGateway,
  verifyStripeSignature,
  type CheckoutRequest,
  type PaymentGateway,
} from '../src/index.ts';

const { emailMessages, invoices, payments } = schema;

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

const LINKS = { advertiseBaseUrl: 'https://advertise.test' };

async function staff(role: 'admin' | 'operator' | 'finance' = 'admin'): Promise<AdminUser> {
  const id = await createAdminUser(db, { email: `${role}${Math.random()}@kiqro.test`, name: 'Staff', role, password: 'correct horse battery' });
  return (await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, id) }))!;
}

async function advertiser(actor: AdminUser, email = 'ua@studio.test'): Promise<AdvertiserSession> {
  const orgId = await createAdvertiser(db, actor, { name: 'Studio', country: 'FI', billingEntity: 'kiqro_inc', invoiceCurrency: 'USD', reversalWindowDays: 30, requireSignedPostbacks: undefined });
  await createAdvertiserUser(db, actor, orgId, { email, name: 'UA Lead' }, LINKS);
  const mail = (await db.select().from(emailMessages).where(eq(emailMessages.to, email)))[0]!;
  await setPasswordWithToken(db, /token=([\w-]+)/.exec(mail.text)![1]!, 'long enough password');
  const login = await advertiserLogin(db, { email, password: 'long enough password', ip: null });
  if (login.status !== 'ok') throw new Error(login.status);
  return (await getAdvertiserSession(db, login.token))!;
}

/** Records gateway calls instead of talking to Stripe. */
function fakeGateway(): PaymentGateway & { requests: CheckoutRequest[] } {
  const requests: CheckoutRequest[] = [];
  return {
    kind: 'stripe',
    requests,
    async createCheckout(req) {
      requests.push(req);
      return { id: `cs_test_${requests.length}`, url: `https://checkout.stripe.test/${requests.length}` };
    },
  };
}

/** Campaign spend, as conversions post it: advertiser balance → revenue. */
async function spend(orgId: string, usdMicros: bigint, at?: Date) {
  const txn = await postTransaction(db, {
    type: 'conversion',
    entries: [
      { accountId: await getAccountId(db, 'advertiser_balance', orgId), amount: -usdMicros },
      { accountId: await getAccountId(db, 'kiqro_revenue', null), amount: usdMicros },
    ],
  });
  if (at) await db.update(schema.ledgerEntries).set({ createdAt: at }).where(eq(schema.ledgerEntries.transactionId, txn));
}

const paidSession = (id: string, cents: number) => ({ id, amount_total: cents, currency: 'usd', payment_status: 'paid' as const, payment_intent: 'pi_123' });

describe('Stripe top-ups', () => {
  it('credits the balance only when Stripe confirms the payment, exactly once', async () => {
    const s = await advertiser(await staff());
    const gateway = fakeGateway();
    const started = await startTopUp(db, s, { amountUsd: '750.50' }, gateway, LINKS, 'en');
    expect(started).toEqual({ ok: true, url: 'https://checkout.stripe.test/1' });
    expect(gateway.requests[0]).toMatchObject({ amountCents: 75_050, orgId: s.org.id, customerEmail: 'ua@studio.test', successUrl: expect.stringContaining('/app/billing?paid=pay_') });

    const balance = () => getAccountId(db, 'advertiser_balance', s.org.id).then((id) => getBalance(db, id));
    expect(await balance()).toBe(0n); // redirect alone never adds money

    expect(await completeStripeCheckout(db, paidSession('cs_test_1', 75_050), LINKS.advertiseBaseUrl)).toBe('credited');
    expect(await completeStripeCheckout(db, paidSession('cs_test_1', 75_050), LINKS.advertiseBaseUrl)).toBe('already_processed');
    expect(await balance()).toBe(750_500_000n);

    const [payment] = await db.select().from(payments);
    expect(payment).toMatchObject({ status: 'succeeded', method: 'stripe', stripePaymentIntentId: 'pi_123', advertiserUserId: s.user.id });
    const receipt = await db.select().from(emailMessages).where(eq(emailMessages.template, 'payment_received'));
    expect(receipt).toHaveLength(1);
  });

  it('refuses amounts below the minimum, above the card maximum, and mismatched charges', async () => {
    const s = await advertiser(await staff());
    const gateway = fakeGateway();
    expect(await startTopUp(db, s, { amountUsd: '499.99' }, gateway, LINKS, 'tr')).toEqual({ ok: false, message: 'en az 500 $ yüklenebilir' });
    expect(await startTopUp(db, s, { amountUsd: '12.345' }, gateway, LINKS, 'en')).toMatchObject({ ok: false });
    expect(await startTopUp(db, s, { amountUsd: '60000' }, gateway, LINKS, 'en')).toMatchObject({ ok: false, message: expect.stringContaining('bank transfer') });
    expect(await startTopUp(db, s, { amountUsd: '500' }, null, LINKS, 'en')).toMatchObject({ ok: false });
    expect(gateway.requests).toHaveLength(0);

    await startTopUp(db, s, { amountUsd: '500' }, gateway, LINKS, 'en');
    expect(await completeStripeCheckout(db, paidSession('cs_test_1', 100), LINKS.advertiseBaseUrl)).toBe('amount_mismatch');
    expect(await completeStripeCheckout(db, { ...paidSession('cs_test_1', 50_000), payment_status: 'unpaid' }, LINKS.advertiseBaseUrl)).toBe('not_paid');
    expect(await completeStripeCheckout(db, paidSession('cs_unknown', 50_000), LINKS.advertiseBaseUrl)).toBe('unknown_payment');
    await closeStripeCheckout(db, 'cs_test_1', 'expired');
    expect((await db.select().from(payments))[0]!.status).toBe('expired');
  });

  it('marks the payment failed when Stripe rejects the checkout', async () => {
    const s = await advertiser(await staff());
    const gateway = stripeGateway({ secretKey: 'sk_test_x', fetcher: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'bad' } }) }) });
    expect(await startTopUp(db, s, { amountUsd: '500' }, gateway, LINKS, 'en')).toMatchObject({ ok: false });
    expect((await db.select().from(payments))[0]!.status).toBe('failed');
  });

  it('verifies webhook signatures and rejects old or tampered payloads', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    const payload = '{"type":"checkout.session.completed"}';
    const header = signStripePayload(payload, 'whsec_test', now);
    expect(verifyStripeSignature(payload, header, 'whsec_test', now)).toBe(true);
    expect(verifyStripeSignature(payload + ' ', header, 'whsec_test', now)).toBe(false);
    expect(verifyStripeSignature(payload, header, 'whsec_other', now)).toBe(false);
    expect(verifyStripeSignature(payload, header, 'whsec_test', new Date(now.getTime() + 10 * 60_000))).toBe(false);
    expect(verifyStripeSignature(payload, null, 'whsec_test', now)).toBe(false);
  });
});

describe('credit terms and monthly invoices', () => {
  it('only finance and admins set credit terms; the credit line extends what can be spent', async () => {
    const actor = await staff();
    const s = await advertiser(actor);
    await expect(setCreditTerms(db, await staff('operator'), s.org.id, { creditLimitUsd: '5000', paymentTermsDays: 30 })).rejects.toBeInstanceOf(AdminError);
    await setCreditTerms(db, await staff('finance'), s.org.id, { creditLimitUsd: '5000', paymentTermsDays: 45 });
    await recordTopUp(db, actor, s.org.id, { amountUsd: '1000', memo: 'wire 1' }, LINKS);
    await spend(s.org.id, 1_500_000_000n);
    expect(await creditPosition(db, s.org.id)).toMatchObject({ balance: -500_000_000n, creditLimit: 5_000_000_000n, spendable: 4_500_000_000n, outstanding: 500_000_000n, creditSuspended: false });
  });

  it('invoices the uncovered debt once a month, applies payments oldest first and suspends credit when overdue', async () => {
    const actor = await staff();
    const s = await advertiser(actor);
    await setCreditTerms(db, actor, s.org.id, { creditLimitUsd: '5000', paymentTermsDays: 30 });
    await spend(s.org.id, 1_200_000_000n, new Date('2026-10-15T00:00:00Z'));

    // Mid-month runs do nothing; the first days of the next month issue October's invoice.
    expect(await issueMonthlyInvoices(db, LINKS, new Date('2026-10-20T00:00:00Z'))).toBe(0);
    const nov1 = new Date('2026-11-01T00:10:00Z');
    expect(await issueMonthlyInvoices(db, LINKS, nov1)).toBe(1);
    expect(await issueMonthlyInvoices(db, LINKS, new Date('2026-11-01T00:20:00Z'))).toBe(0);
    const [invoice] = await db.select().from(invoices);
    expect(invoice).toMatchObject({ number: 'KI-2026-00001', amount: 1_200_000_000n, periodSpend: 1_200_000_000n, status: 'open', dueAt: new Date('2026-12-01T00:10:00Z') });
    expect(await db.select().from(emailMessages).where(eq(emailMessages.template, 'invoice_issued'))).toHaveLength(1);

    // November: more spend, partly paid by transfer. December's invoice covers only the new debt.
    await spend(s.org.id, 300_000_000n, new Date('2026-11-10T00:00:00Z'));
    await recordTopUp(db, actor, s.org.id, { amountUsd: '200', memo: 'wire KI-2026-00001' }, LINKS);
    expect((await db.select().from(invoices))[0]!.amountPaid).toBe(200_000_000n);

    // Overdue: one reminder, credit suspended, nothing spendable beyond the (negative) balance.
    const dec2 = new Date('2026-12-02T00:00:00Z');
    expect(await remindOverdueInvoices(db, LINKS, dec2)).toBe(1);
    expect(await remindOverdueInvoices(db, LINKS, dec2)).toBe(0);
    expect(await creditPosition(db, s.org.id, dec2)).toMatchObject({ creditSuspended: true, spendable: -1_300_000_000n });

    expect(await issueMonthlyInvoices(db, LINKS, dec2)).toBe(1);
    const second = (await db.select().from(invoices).where(eq(invoices.number, 'KI-2026-00002')))[0]!;
    expect(second).toMatchObject({ amount: 300_000_000n, periodSpend: 300_000_000n });

    // A Stripe payment of the first invoice's remainder clears it and lifts the suspension.
    const gateway = fakeGateway();
    const started = await startTopUp(db, s, { invoiceId: invoice!.id }, gateway, LINKS, 'en');
    expect(started.ok).toBe(true);
    expect(gateway.requests[0]!.amountCents).toBe(100_000);
    await completeStripeCheckout(db, paidSession('cs_test_1', 100_000), LINKS.advertiseBaseUrl);
    const overview = await billingOverview(db, s.org.id, dec2);
    expect(overview.invoices.find((i) => i.id === invoice!.id)).toMatchObject({ status: 'paid', overdue: false });
    expect(overview.position).toMatchObject({ creditSuspended: false, balance: -300_000_000n });
    expect(await startTopUp(db, s, { invoiceId: invoice!.id }, gateway, LINKS, 'en')).toMatchObject({ ok: false });
  });

  it('does not invoice prepaid advertisers', async () => {
    const actor = await staff();
    const s = await advertiser(actor);
    await recordTopUp(db, actor, s.org.id, { amountUsd: '500', memo: 'wire 1' }, LINKS);
    await spend(s.org.id, 100_000_000n, new Date('2026-10-15T00:00:00Z'));
    expect(await issueMonthlyInvoices(db, LINKS, new Date('2026-11-01T00:10:00Z'))).toBe(0);
  });
});

import { and, eq, gte, isNull, like, lt, notInArray, or, sql } from 'drizzle-orm';
import { formatMicros } from '@kiqro/core';
import { getAccountId, getBalance, lockAccount, newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { enqueueEmail } from '../email/queue.ts';
import type { EmailTemplate } from '../email/templates.ts';
import { emitWebhook } from '../webhooks.ts';

const { advertiserUsers, invoices, ledgerEntries, ledgerTransactions, organizations } = schema;

const DAY_MS = 86_400_000;
const money = (micros: bigint) => `$${formatMicros(micros)}`;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** The calendar month (UTC) before `now`. */
export function previousMonth(now: Date): { start: Date; end: Date } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return { start, end };
}

/** Separate number series per legal entity: KI-2026-00001 (Kiqro Inc.), KO-… (Kiqro Oy). */
async function nextInvoiceNumber(tx: DbOrTx, billingEntity: string, now: Date): Promise<string> {
  const prefix = `${billingEntity === 'kiqro_oy' ? 'KO' : 'KI'}-${now.getUTCFullYear()}-`;
  const [row] = await tx.select({ n: sql<string>`count(*)` }).from(invoices).where(like(invoices.number, `${prefix}%`));
  return `${prefix}${String(Number(row!.n) + 1).padStart(5, '0')}`;
}

/** Campaign spend minus reversals charged to the balance in [start, end) (payments and refunds excluded). */
async function spendBetween(tx: DbOrTx, accountId: string, start: Date, end: Date): Promise<bigint> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .where(and(eq(ledgerEntries.accountId, accountId), notInArray(ledgerTransactions.type, ['advertiser_topup', 'advertiser_refund']), gte(ledgerEntries.createdAt, start), lt(ledgerEntries.createdAt, end)));
  return -BigInt(row!.total);
}

/** Invoice mail goes to every active panel user and to the advertiser's invoice e-mail, if set. */
async function mailOrgUsers(tx: DbOrTx, orgId: string, build: (user: { name: string }) => EmailTemplate, now: Date) {
  const users = await tx.select().from(advertiserUsers).where(and(eq(advertiserUsers.orgId, orgId), isNull(advertiserUsers.disabledAt)));
  for (const user of users) await enqueueEmail(tx, user.email, build(user), user.locale === 'tr' ? 'tr' : 'en', now);
  const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { billingEmail: true, legalName: true, name: true } });
  if (org?.billingEmail && !users.some((u) => u.email === org.billingEmail)) {
    await enqueueEmail(tx, org.billingEmail, build({ name: org.legalName ?? org.name }), 'en', now);
  }
}

/** Invoices are issued in the first days of a month; later runs leave new debt for next month. */
export const INVOICE_ISSUE_DAYS = 3;

/**
 * Monthly invoicing for advertisers on credit terms. At the start of a month, each advertiser
 * with debt (negative balance) not already covered by open invoices gets an invoice for that
 * amount, due paymentTermsDays later. Idempotent per (advertiser, month). Returns invoices issued.
 */
export async function issueMonthlyInvoices(db: Db, opts: { advertiseBaseUrl: string }, now = new Date()): Promise<number> {
  if (now.getUTCDate() > INVOICE_ISSUE_DAYS) return 0;
  const period = previousMonth(now);
  const candidates = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.type, 'advertiser'), or(sql`${organizations.creditLimit} > 0`, sql`exists (select 1 from invoices i where i.org_id = ${organizations.id})`)));

  let issued = 0;
  for (const org of candidates) {
    const created = await db.transaction(async (tx) => {
      const exists = await tx.query.invoices.findFirst({ where: and(eq(invoices.orgId, org.id), eq(invoices.periodStart, period.start)) });
      if (exists) return false;
      const account = await getAccountId(tx, 'advertiser_balance', org.id);
      await lockAccount(tx, account); // payments credited concurrently wait for this invoice
      const balance = await getBalance(tx, account);
      const [open] = await tx
        .select({ total: sql<string>`coalesce(sum(${invoices.amount} - ${invoices.amountPaid}), 0)` })
        .from(invoices)
        .where(and(eq(invoices.orgId, org.id), eq(invoices.status, 'open')));
      const amount = (balance < 0n ? -balance : 0n) - BigInt(open!.total);
      if (amount <= 0n) return false;

      const id = newId('invoice');
      const number = await nextInvoiceNumber(tx, org.billingEntity, now);
      const dueAt = new Date(now.getTime() + org.paymentTermsDays * DAY_MS);
      await tx.insert(invoices).values({
        id,
        number,
        orgId: org.id,
        billingEntity: org.billingEntity,
        periodStart: period.start,
        periodEnd: period.end,
        periodSpend: await spendBetween(tx, account, period.start, period.end),
        amount,
        issuedAt: now,
        dueAt,
      });
      await emitWebhook(tx, org.id, 'invoice.issued', { invoice_id: id, number, amount_usd: formatMicros(amount), due_at: dueAt.toISOString(), period: isoDate(period.start).slice(0, 7) }, now);
      const payLink = `${opts.advertiseBaseUrl.replace(/\/$/, '')}/app/billing`;
      await mailOrgUsers(
        tx,
        org.id,
        (user) => ({
          name: 'invoice_issued',
          data: { name: user.name, company: org.name, number, amount: money(amount), period: isoDate(period.start).slice(0, 7), dueDate: isoDate(dueAt), payLink },
        }),
        now,
      );
      return true;
    });
    if (created) issued++;
  }
  return issued;
}

/**
 * One reminder per invoice once it is past due. From then on the credit line is suspended
 * (see creditPosition) until the invoice is paid. Returns reminders queued.
 */
export async function remindOverdueInvoices(db: Db, opts: { advertiseBaseUrl: string }, now = new Date()): Promise<number> {
  const overdue = await db
    .select({ invoice: invoices, org: organizations })
    .from(invoices)
    .innerJoin(organizations, eq(organizations.id, invoices.orgId))
    .where(and(eq(invoices.status, 'open'), lt(invoices.dueAt, now), isNull(invoices.overdueNotifiedAt)));
  for (const { invoice, org } of overdue) {
    await db.transaction(async (tx) => {
      await mailOrgUsers(
        tx,
        org.id,
        (user) => ({
          name: 'invoice_overdue',
          data: {
            name: user.name,
            company: org.name,
            number: invoice.number,
            amount: money(invoice.amount - invoice.amountPaid),
            dueDate: isoDate(invoice.dueAt),
            payLink: `${opts.advertiseBaseUrl.replace(/\/$/, '')}/app/billing`,
          },
        }),
        now,
      );
      await tx.update(invoices).set({ overdueNotifiedAt: now }).where(eq(invoices.id, invoice.id));
    });
  }
  return overdue.length;
}

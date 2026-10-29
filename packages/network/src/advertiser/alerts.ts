import { and, eq, isNull, sql } from 'drizzle-orm';
import { formatMicros } from '@kiqro/core';
import { schema, type Db } from '@kiqro/db';
import { enqueueEmail } from '../email/queue.ts';
import { emitWebhook } from '../webhooks.ts';
import type { LinkOptions } from './auth.ts';

const { advertiserUsers, ledgerAccounts, ledgerEntries, organizations } = schema;

const ALERT_INTERVAL_MS = 24 * 3_600_000;
const money = (micros: bigint) => `$${formatMicros(micros)}`;

/**
 * Low-balance e-mails. An advertiser whose balance is below its threshold gets one alert per
 * day (to every active panel user); once the balance is back above the threshold the alert
 * re-arms. Run periodically from the worker. Returns how many advertisers were alerted.
 */
export async function checkLowBalances(db: Db, opts: LinkOptions, now = new Date()): Promise<number> {
  const orgs = await db.select().from(organizations).where(and(eq(organizations.type, 'advertiser'), eq(organizations.status, 'active')));
  const balances = await db
    .select({ orgId: ledgerAccounts.orgId, total: sql<string>`sum(${ledgerEntries.amount})` })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(eq(ledgerAccounts.kind, 'advertiser_balance'))
    .groupBy(ledgerAccounts.orgId);
  const byOrg = new Map(balances.map((b) => [b.orgId, BigInt(b.total)]));

  let alerted = 0;
  for (const org of orgs) {
    // What campaigns can still spend: prepaid balance plus any credit line.
    const balance = (byOrg.get(org.id) ?? 0n) + org.creditLimit;
    if (balance >= org.lowBalanceThreshold) {
      if (org.lowBalanceAlertedAt) await db.update(organizations).set({ lowBalanceAlertedAt: null }).where(eq(organizations.id, org.id));
      continue;
    }
    if (org.lowBalanceAlertedAt && now.getTime() - org.lowBalanceAlertedAt.getTime() < ALERT_INTERVAL_MS) continue;

    const users = await db.select().from(advertiserUsers).where(and(eq(advertiserUsers.orgId, org.id), isNull(advertiserUsers.disabledAt)));
    await db.transaction(async (tx) => {
      for (const user of users) {
        await enqueueEmail(
          tx,
          user.email,
          {
            name: 'low_balance',
            data: { name: user.name, company: org.name, balance: money(balance), threshold: money(org.lowBalanceThreshold), panelLink: `${opts.advertiseBaseUrl.replace(/\/$/, '')}/app/billing` },
          },
          user.locale === 'tr' ? 'tr' : 'en',
          now,
        );
      }
      await emitWebhook(tx, org.id, 'balance.low', { available_usd: formatMicros(balance), threshold_usd: formatMicros(org.lowBalanceThreshold) }, now);
      await tx.update(organizations).set({ lowBalanceAlertedAt: now }).where(eq(organizations.id, org.id));
    });
    if (users.length) alerted++;
  }
  return alerted;
}

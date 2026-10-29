import { sql } from 'drizzle-orm';
import { createDb, getAccountId, getBalance, runMigrations, type Db } from '@kiqro/db';
import { buildServer } from '../src/server.ts';

export const TRACKING_BASE = 'https://track.test';

export async function setupDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  await runMigrations();
  const { db, pool } = createDb();
  return { db, close: () => pool.end() };
}

export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`
    truncate publisher_postbacks, ledger_entries, ledger_transactions, ledger_accounts, conversions,
      postbacks_raw, clicks, placements, task_payouts, campaign_tasks, campaigns, products, organizations cascade`);
}

export function server(db: Db) {
  return buildServer({ db, trackingBaseUrl: TRACKING_BASE });
}

export async function balanceOf(db: Db, kind: 'advertiser_balance' | 'publisher_payable' | 'kiqro_revenue', orgId: string | null): Promise<bigint> {
  return getBalance(db, await getAccountId(db, kind, orgId));
}

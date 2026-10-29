import { sql } from 'drizzle-orm';
import { createDb, type Db } from './client.ts';
import { runMigrations } from './migrate.ts';

/** Migrates the test database and opens a connection. Only for test suites. */
export async function setupTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  if (!process.env.DATABASE_URL?.includes('_test')) throw new Error('Refusing to run tests against a non-test database');
  await runMigrations();
  const { db, pool } = createDb();
  return { db, close: () => pool.end() };
}

/** Empties every application table. */
export async function resetTestDb(db: Db): Promise<void> {
  await db.execute(sql`
    truncate revenue_events, webhook_deliveries, webhook_endpoints, advertiser_api_keys, claims, payments, invoices, audit_log, email_messages, advertiser_tokens, leads, advertiser_login_attempts, advertiser_sessions, advertiser_users, admin_login_attempts, admin_sessions, admin_users, publisher_postbacks, ledger_entries, ledger_transactions,
      ledger_accounts, conversions, postbacks_raw, clicks, placements, task_payouts, campaign_tasks, campaigns,
      products, organizations cascade`);
}

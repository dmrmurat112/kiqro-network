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
    truncate audit_log, admin_sessions, admin_users, publisher_postbacks, ledger_entries, ledger_transactions,
      ledger_accounts, conversions, postbacks_raw, clicks, placements, task_payouts, campaign_tasks, campaigns,
      products, organizations cascade`);
}

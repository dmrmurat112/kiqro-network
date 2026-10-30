import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createDb } from './client.ts';

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/** Errors that mean "the database is not accepting connections yet" (e.g. still being created). */
const NOT_READY = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', '57P03' /* cannot_connect_now */]);

/**
 * Waits until the database accepts connections. A freshly created managed database (the first
 * deploy of a Render Blueprint) can take a few minutes; migrations would otherwise fail.
 */
export async function waitForDatabase(url = process.env.DATABASE_URL, timeoutMs = 5 * 60_000, log = console.log): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
    try {
      await client.connect();
      await client.query('select 1');
      return;
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (!NOT_READY.has(code) || Date.now() > deadline) throw e;
      log(`database not ready (${code}), retrying… (attempt ${attempt})`);
      await sleep(Math.min(2_000 * attempt, 15_000));
    } finally {
      await client.end().catch(() => {});
    }
  }
}

export async function runMigrations(url?: string): Promise<void> {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await waitForDatabase();
  await runMigrations();
  console.log('migrations applied');
}

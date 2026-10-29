import 'server-only';
import { createDb, schema, type Db } from '@kiqro/db';

// Reuse one pool across hot reloads in development, but rebuild it when the schema module
// reloads: a client built with an older schema silently omits newly added columns. The old
// pool is left to idle out, since modules not yet reloaded may still be using it.
const globalForDb = globalThis as unknown as { kiqroAdminDb?: { db: Db; schema: typeof schema } };

function getDb(): Db {
  const cached = globalForDb.kiqroAdminDb;
  if (cached?.schema === schema) return cached.db;
  const { db } = createDb();
  globalForDb.kiqroAdminDb = { db, schema };
  return db;
}

/**
 * Created on first use, not at import: `next build` imports server modules without a
 * DATABASE_URL (e.g. in the Docker build), and must not fail there.
 */
export const db: Db = new Proxy({} as Db, {
  get: (_, prop) => Reflect.get(getDb(), prop),
});

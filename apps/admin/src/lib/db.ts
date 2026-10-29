import 'server-only';
import { createDb, type Db } from '@kiqro/db';

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { kiqroAdminDb?: Db };

export const db: Db = globalForDb.kiqroAdminDb ?? createDb().db;
if (process.env.NODE_ENV !== 'production') globalForDb.kiqroAdminDb = db;

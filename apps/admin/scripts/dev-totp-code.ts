/**
 * Local development only: prints the current 2FA code for an admin, so test accounts can log in
 * without a phone. Anyone with database access could do this anyway; never run it in production.
 *   npm run dev-totp-code -w @kiqro/admin -- dev@kiqro.local
 */
import { eq } from 'drizzle-orm';
import { totp } from '@kiqro/core';
import { createDb, schema } from '@kiqro/db';

if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.includes('localhost')) {
  console.error('Bu komut yalnızca yerel geliştirme veritabanında çalışır.');
  process.exit(1);
}

const [email] = process.argv.slice(2);
const { db, pool } = createDb();
const user = email ? await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.email, email.toLowerCase()) }) : undefined;
await pool.end();
if (!user?.totpSecret) {
  console.error('Admin bulunamadı ya da 2FA kurulmamış.');
  process.exit(1);
}
console.log(totp(user.totpSecret, new Date()));

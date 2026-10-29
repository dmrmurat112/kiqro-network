/**
 * Creates an admin panel user.
 *   npm run create-admin -w @kiqro/admin -- <email> "<name>" [admin|operator|finance|viewer]
 * The password is read from ADMIN_PASSWORD, or generated and printed once.
 */
import { randomBytes } from 'node:crypto';
import { createDb } from '@kiqro/db';
import { createAdminUser, type AdminRole } from '@kiqro/network/admin';

const [email, name, role = 'admin'] = process.argv.slice(2);
if (!email || !name || !['admin', 'operator', 'finance', 'viewer'].includes(role)) {
  console.error('Kullanım: create-admin <email> "<ad soyad>" [admin|operator|finance|viewer]');
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');
const { db, pool } = createDb();
await createAdminUser(db, { email, name, role: role as AdminRole, password });
await pool.end();

console.log(`Admin oluşturuldu: ${email} (${role})`);
if (!process.env.ADMIN_PASSWORD) console.log(`Parola (bir kez gösterilir, şimdi kaydedin): ${password}`);

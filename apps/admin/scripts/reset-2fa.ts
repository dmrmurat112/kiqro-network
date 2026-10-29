/**
 * Clears an admin's 2FA when they lost their authenticator (run on the server by an operator).
 *   npm run reset-2fa -w @kiqro/admin -- <email>
 * The admin must enroll again at next login. Recorded in the audit log without an actor.
 */
import { eq } from 'drizzle-orm';
import { createDb, newId, schema } from '@kiqro/db';

const [email] = process.argv.slice(2);
if (!email) {
  console.error('Kullanım: reset-2fa <email>');
  process.exit(1);
}

const { db, pool } = createDb();
const user = await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.email, email.toLowerCase()) });
if (!user) {
  console.error('Admin bulunamadı.');
  process.exit(1);
}
await db.transaction(async (tx) => {
  await tx.update(schema.adminUsers).set({ totpSecret: null, totpEnabledAt: null }).where(eq(schema.adminUsers.id, user.id));
  await tx.delete(schema.adminSessions).where(eq(schema.adminSessions.adminUserId, user.id));
  await tx.insert(schema.auditLog).values({ id: newId('audit'), adminUserId: null, action: 'admin.totp_reset_cli', entityType: 'admin_user', entityId: user.id });
});
await pool.end();
console.log(`2FA sıfırlandı: ${email}`);

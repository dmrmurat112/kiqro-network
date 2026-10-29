import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { newId, schema, type Db } from '@kiqro/db';

const { adminSessions, adminUsers } = schema;

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminRole = AdminUser['role'];

const SCRYPT_N = 2 ** 15;
const SCRYPT_OPTIONS: ScryptOptions = { N: SCRYPT_N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
export const SESSION_TTL_MS = 12 * 3_600_000;

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))));
}

/** Returns "scrypt$N$salt$hash" (base64 parts). */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !n || !salt || !hash) return false;
  const key = await scrypt(password, Buffer.from(salt, 'base64'), { ...SCRYPT_OPTIONS, N: Number(n) });
  const expected = Buffer.from(hash, 'base64');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createAdminUser(db: Db, input: { email: string; name: string; role: AdminRole; password: string }): Promise<string> {
  const id = newId('admin');
  await db.insert(adminUsers).values({
    id,
    email: input.email.trim().toLowerCase(),
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(input.password),
  });
  return id;
}

// A real hash of an unguessable password, so unknown e-mails cost the same time as wrong passwords.
const DUMMY_HASH = hashPassword(randomBytes(24).toString('hex'));

/** Checks credentials and opens a session. Returns the raw token for the cookie, or null. */
export async function login(db: Db, email: string, password: string, ip: string | null, now = new Date()): Promise<string | null> {
  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email.trim().toLowerCase()) });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !valid || user.disabledAt) return null;

  const token = randomBytes(32).toString('base64url');
  await db.insert(adminSessions).values({ tokenHash: hashToken(token), adminUserId: user.id, expiresAt: new Date(now.getTime() + SESSION_TTL_MS), ip });
  await db.update(adminUsers).set({ lastLoginAt: now }).where(eq(adminUsers.id, user.id));
  return token;
}

export async function getSessionUser(db: Db, token: string | undefined, now = new Date()): Promise<AdminUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(and(eq(adminSessions.tokenHash, hashToken(token)), gt(adminSessions.expiresAt, now), isNull(adminUsers.disabledAt)));
  return row?.user ?? null;
}

export async function logout(db: Db, token: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
}

/**
 * Permission check for admin actions. "finance" may move money, "operator" may manage
 * campaigns and review conversions, "admin" may do everything, "viewer" only reads.
 */
export function can(user: AdminUser, action: 'read' | 'manage_campaigns' | 'review' | 'move_money' | 'manage_publishers' | 'manage_admins'): boolean {
  if (user.role === 'admin') return true;
  switch (action) {
    case 'read':
      return true;
    case 'manage_campaigns':
    case 'review':
      return user.role === 'operator';
    case 'move_money':
      return user.role === 'finance';
    default:
      return false;
  }
}

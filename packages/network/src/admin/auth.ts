import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { newTotpSecret, verifyTotp } from '@kiqro/core';
import { newId, schema, type Db } from '@kiqro/db';
import { audit } from './audit.ts';
import { AdminError } from './errors.ts';

const { adminLoginAttempts, adminSessions, adminUsers } = schema;

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

export const LOCKOUT_WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 20;

export type LoginResult =
  | { status: 'ok'; token: string; needsTotpSetup: boolean }
  | { status: 'totp_required' }
  | { status: 'invalid' }
  | { status: 'locked' };

async function recentFailures(db: Db, column: typeof adminLoginAttempts.email | typeof adminLoginAttempts.ip, value: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(adminLoginAttempts)
    .where(and(eq(column, value), eq(adminLoginAttempts.success, false), gt(adminLoginAttempts.createdAt, new Date(now.getTime() - LOCKOUT_WINDOW_MS))));
  return row!.n;
}

/**
 * Checks credentials and opens a session. Users with 2FA must send the authenticator code;
 * without a code the result is "totp_required" so the form can ask for it. Repeated failures
 * lock the e-mail (and, more loosely, the IP) for LOCKOUT_WINDOW_MS.
 */
export async function login(
  db: Db,
  input: { email: string; password: string; totpCode?: string; ip: string | null },
  now = new Date(),
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  if ((await recentFailures(db, adminLoginAttempts.email, email, now)) >= MAX_FAILURES_PER_EMAIL) return { status: 'locked' };
  if (input.ip && (await recentFailures(db, adminLoginAttempts.ip, input.ip, now)) >= MAX_FAILURES_PER_IP) return { status: 'locked' };

  const record = (success: boolean) => db.insert(adminLoginAttempts).values({ id: newId('loginAttempt'), email, ip: input.ip, success, createdAt: now });

  const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !valid || user.disabledAt) {
    await record(false);
    return { status: 'invalid' };
  }

  if (user.totpEnabledAt && user.totpSecret) {
    if (!input.totpCode) return { status: 'totp_required' };
    if (!verifyTotp(user.totpSecret, input.totpCode, now)) {
      await record(false);
      return { status: 'invalid' };
    }
  }

  await record(true);
  const token = randomBytes(32).toString('base64url');
  await db.insert(adminSessions).values({ tokenHash: hashToken(token), adminUserId: user.id, expiresAt: new Date(now.getTime() + SESSION_TTL_MS), ip: input.ip });
  await db.update(adminUsers).set({ lastLoginAt: now }).where(eq(adminUsers.id, user.id));
  return { status: 'ok', token, needsTotpSetup: !user.totpEnabledAt };
}

/** Starts (or restarts) 2FA enrollment and returns the new secret to show as a QR code. */
export async function startTotpEnrollment(db: Db, user: AdminUser): Promise<string> {
  if (user.totpEnabledAt) throw new AdminError('İki aşamalı doğrulama zaten etkin.');
  const secret = newTotpSecret();
  await db.update(adminUsers).set({ totpSecret: secret }).where(eq(adminUsers.id, user.id));
  return secret;
}

/** Finishes enrollment once the user proves their authenticator produces valid codes. */
export async function confirmTotpEnrollment(db: Db, user: AdminUser, code: string, now = new Date()): Promise<void> {
  const fresh = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, user.id) });
  if (!fresh?.totpSecret || fresh.totpEnabledAt) throw new AdminError('Önce kurulumu başlatın.');
  if (!verifyTotp(fresh.totpSecret, code, now)) throw new AdminError('Kod hatalı. Telefonunuzun saatinin doğru olduğundan emin olun.');
  await db.transaction(async (tx) => {
    await tx.update(adminUsers).set({ totpEnabledAt: now }).where(eq(adminUsers.id, user.id));
    await audit(tx, user.id, 'admin.totp_enabled', 'admin_user', user.id);
  });
}

/** Clears another admin's 2FA (lost phone). They must enroll again at next login. */
export async function resetTotp(db: Db, actor: AdminUser, adminUserId: string): Promise<void> {
  if (!can(actor, 'manage_admins')) throw new AdminError('Bu işlem için yetkiniz yok.');
  await db.transaction(async (tx) => {
    await tx.update(adminUsers).set({ totpSecret: null, totpEnabledAt: null }).where(eq(adminUsers.id, adminUserId));
    await tx.delete(adminSessions).where(eq(adminSessions.adminUserId, adminUserId));
    await audit(tx, actor.id, 'admin.totp_reset', 'admin_user', adminUserId);
  });
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

import { createHash, randomBytes } from 'node:crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { newId, schema, type Db } from '@kiqro/db';
import { audit } from '../admin/audit.ts';
import { hashPassword, verifyPassword, type AdminUser } from '../admin/auth.ts';
import { AdminError, requirePermission } from '../admin/errors.ts';
import { parseInput } from '../admin/organizations.ts';

const { advertiserLoginAttempts, advertiserSessions, advertiserUsers, organizations } = schema;

export type AdvertiserUser = typeof advertiserUsers.$inferSelect;
export interface AdvertiserSession {
  user: AdvertiserUser;
  org: typeof organizations.$inferSelect;
}

export const ADVERTISER_SESSION_TTL_MS = 7 * 24 * 3_600_000;
const LOCKOUT_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const DUMMY_HASH = hashPassword(randomBytes(24).toString('hex'));

export const advertiserUserInput = z.object({
  email: z.string().trim().toLowerCase().email('geçerli bir e-posta olmalı'),
  name: z.string().trim().min(2),
  locale: z.enum(['en', 'tr']).default('en'),
});

/**
 * Kiqro staff create advertiser logins (Phase 1 has no self sign-up). Returns a one-time
 * password to hand to the advertiser over a secure channel.
 */
export async function createAdvertiserUser(db: Db, actor: AdminUser, orgId: string, input: z.input<typeof advertiserUserInput>): Promise<{ id: string; password: string }> {
  requirePermission(actor, 'manage_campaigns');
  const data = parseInput(advertiserUserInput, input);
  const password = randomBytes(12).toString('base64url');
  const id = newId('advertiserUser');
  await db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (org?.type !== 'advertiser') throw new AdminError('Reklamveren bulunamadı.');
    const taken = await tx.query.advertiserUsers.findFirst({ where: eq(advertiserUsers.email, data.email) });
    if (taken) throw new AdminError('Bu e-posta zaten kullanılıyor.');
    await tx.insert(advertiserUsers).values({ id, orgId, email: data.email, name: data.name, locale: data.locale, passwordHash: await hashPassword(password) });
    await audit(tx, actor.id, 'advertiser_user.create', 'advertiser_user', id, { orgId, email: data.email });
  });
  return { id, password };
}

export async function listAdvertiserUsers(db: Db, orgId: string) {
  return db
    .select({ id: advertiserUsers.id, email: advertiserUsers.email, name: advertiserUsers.name, lastLoginAt: advertiserUsers.lastLoginAt, disabledAt: advertiserUsers.disabledAt })
    .from(advertiserUsers)
    .where(eq(advertiserUsers.orgId, orgId));
}

async function failures(db: Db, column: typeof advertiserLoginAttempts.email | typeof advertiserLoginAttempts.ip, value: string, now: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(advertiserLoginAttempts)
    .where(and(eq(column, value), eq(advertiserLoginAttempts.success, false), gt(advertiserLoginAttempts.createdAt, new Date(now.getTime() - LOCKOUT_WINDOW_MS))));
  return row!.n;
}

export type AdvertiserLoginResult = { status: 'ok'; token: string; locale: string } | { status: 'invalid' } | { status: 'locked' };

export async function advertiserLogin(db: Db, input: { email: string; password: string; ip: string | null }, now = new Date()): Promise<AdvertiserLoginResult> {
  const email = input.email.trim().toLowerCase();
  if ((await failures(db, advertiserLoginAttempts.email, email, now)) >= MAX_FAILURES_PER_EMAIL) return { status: 'locked' };
  if (input.ip && (await failures(db, advertiserLoginAttempts.ip, input.ip, now)) >= MAX_FAILURES_PER_IP) return { status: 'locked' };

  const user = await db.query.advertiserUsers.findFirst({ where: eq(advertiserUsers.email, email) });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await DUMMY_HASH));
  const org = user && (await db.query.organizations.findFirst({ where: eq(organizations.id, user.orgId) }));
  const ok = Boolean(user && valid && !user.disabledAt && org?.status === 'active');
  await db.insert(advertiserLoginAttempts).values({ id: newId('loginAttempt'), email, ip: input.ip, success: ok, createdAt: now });
  if (!ok || !user) return { status: 'invalid' };

  const token = randomBytes(32).toString('base64url');
  await db.insert(advertiserSessions).values({ tokenHash: hashToken(token), advertiserUserId: user.id, expiresAt: new Date(now.getTime() + ADVERTISER_SESSION_TTL_MS), ip: input.ip });
  await db.update(advertiserUsers).set({ lastLoginAt: now }).where(eq(advertiserUsers.id, user.id));
  return { status: 'ok', token, locale: user.locale };
}

/** Resolves a session cookie to the user and their (active) organization. */
export async function getAdvertiserSession(db: Db, token: string | undefined, now = new Date()): Promise<AdvertiserSession | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: advertiserUsers, org: organizations })
    .from(advertiserSessions)
    .innerJoin(advertiserUsers, eq(advertiserUsers.id, advertiserSessions.advertiserUserId))
    .innerJoin(organizations, eq(organizations.id, advertiserUsers.orgId))
    .where(and(eq(advertiserSessions.tokenHash, hashToken(token)), gt(advertiserSessions.expiresAt, now), isNull(advertiserUsers.disabledAt), eq(organizations.status, 'active')));
  return row ?? null;
}

export async function advertiserLogout(db: Db, token: string): Promise<void> {
  await db.delete(advertiserSessions).where(eq(advertiserSessions.tokenHash, hashToken(token)));
}

/** Lets an advertiser user change their own password (requires the current one). */
export async function changeAdvertiserPassword(db: Db, user: AdvertiserUser, current: string, next: string): Promise<void> {
  if (!(await verifyPassword(current, user.passwordHash))) throw new AdminError('Current password is incorrect.');
  if (next.length < 12) throw new AdminError('The new password must be at least 12 characters.');
  await db.update(advertiserUsers).set({ passwordHash: await hashPassword(next) }).where(eq(advertiserUsers.id, user.id));
}

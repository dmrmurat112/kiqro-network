import { createHash, randomBytes } from 'node:crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { audit } from '../admin/audit.ts';
import { hashPassword, verifyPassword, type AdminUser } from '../admin/auth.ts';
import { AdminError, requirePermission } from '../admin/errors.ts';
import { parseInput } from '../admin/organizations.ts';
import { enqueueEmail } from '../email/queue.ts';
import type { EmailLocale } from '../email/templates.ts';

const { advertiserLoginAttempts, advertiserSessions, advertiserTokens, advertiserUsers, organizations } = schema;

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

export const INVITE_TTL_HOURS = 72;
export const RESET_TTL_MINUTES = 60;
const MAX_RESETS_PER_HOUR = 3;

/** Base URL of advertise.kiqro.com, used to build links in e-mails. */
export interface LinkOptions {
  advertiseBaseUrl: string;
}

/** Creates a single-use token (invite or reset) and returns the raw value for the link. */
async function issueToken(tx: DbOrTx, userId: string, purpose: 'invite' | 'reset', ttlMs: number, now: Date): Promise<string> {
  // Only the newest link of a kind works: older unused ones are retired.
  await tx
    .update(advertiserTokens)
    .set({ usedAt: now })
    .where(and(eq(advertiserTokens.advertiserUserId, userId), eq(advertiserTokens.purpose, purpose), isNull(advertiserTokens.usedAt)));
  const token = randomBytes(32).toString('base64url');
  await tx.insert(advertiserTokens).values({ tokenHash: hashToken(token), advertiserUserId: userId, purpose, expiresAt: new Date(now.getTime() + ttlMs), createdAt: now });
  return token;
}

const asLocale = (locale: string): EmailLocale => (locale === 'tr' ? 'tr' : 'en');
const passwordLink = (opts: LinkOptions, token: string) => `${opts.advertiseBaseUrl.replace(/\/$/, '')}/set-password?token=${token}`;

/**
 * Kiqro staff create advertiser logins (Phase 1 has no self sign-up). The advertiser receives
 * an invitation e-mail with a link to choose their own password; nobody at Kiqro sees it.
 */
export async function createAdvertiserUser(db: Db, actor: AdminUser, orgId: string, input: z.input<typeof advertiserUserInput>, opts: LinkOptions, now = new Date()): Promise<{ id: string }> {
  requirePermission(actor, 'manage_campaigns');
  const data = parseInput(advertiserUserInput, input);
  const id = newId('advertiserUser');
  await db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (org?.type !== 'advertiser') throw new AdminError('Reklamveren bulunamadı.');
    const taken = await tx.query.advertiserUsers.findFirst({ where: eq(advertiserUsers.email, data.email) });
    if (taken) throw new AdminError('Bu e-posta zaten kullanılıyor.');
    // Unusable random password until the invitation is accepted.
    await tx.insert(advertiserUsers).values({ id, orgId, email: data.email, name: data.name, locale: data.locale, passwordHash: await hashPassword(randomBytes(32).toString('hex')) });
    const token = await issueToken(tx, id, 'invite', INVITE_TTL_HOURS * 3_600_000, now);
    await enqueueEmail(tx, data.email, { name: 'advertiser_invite', data: { name: data.name, company: org.name, link: passwordLink(opts, token), expiresHours: INVITE_TTL_HOURS } }, data.locale, now);
    await audit(tx, actor.id, 'advertiser_user.create', 'advertiser_user', id, { orgId, email: data.email });
  });
  return { id };
}

/** Sends a fresh invitation link (the previous one stops working). */
export async function resendAdvertiserInvite(db: Db, actor: AdminUser, userId: string, opts: LinkOptions, now = new Date()): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ user: advertiserUsers, org: organizations })
      .from(advertiserUsers)
      .innerJoin(organizations, eq(organizations.id, advertiserUsers.orgId))
      .where(eq(advertiserUsers.id, userId));
    if (!row) throw new AdminError('Kullanıcı bulunamadı.');
    const token = await issueToken(tx, userId, 'invite', INVITE_TTL_HOURS * 3_600_000, now);
    await enqueueEmail(tx, row.user.email, { name: 'advertiser_invite', data: { name: row.user.name, company: row.org.name, link: passwordLink(opts, token), expiresHours: INVITE_TTL_HOURS } }, asLocale(row.user.locale), now);
    await audit(tx, actor.id, 'advertiser_user.invite_resent', 'advertiser_user', userId);
  });
}

/**
 * "Forgot password". Always behaves the same whether or not the e-mail exists, so the form
 * cannot be used to discover accounts; at most MAX_RESETS_PER_HOUR links per user per hour.
 */
export async function requestPasswordReset(db: Db, email: string, opts: LinkOptions, now = new Date()): Promise<void> {
  const user = await db.query.advertiserUsers.findFirst({ where: eq(advertiserUsers.email, email.trim().toLowerCase()) });
  if (!user || user.disabledAt) return;
  const [recent] = await db
    .select({ n: count() })
    .from(advertiserTokens)
    .where(and(eq(advertiserTokens.advertiserUserId, user.id), eq(advertiserTokens.purpose, 'reset'), gt(advertiserTokens.createdAt, new Date(now.getTime() - 3_600_000))));
  if (recent!.n >= MAX_RESETS_PER_HOUR) return;
  await db.transaction(async (tx) => {
    const token = await issueToken(tx, user.id, 'reset', RESET_TTL_MINUTES * 60_000, now);
    await enqueueEmail(tx, user.email, { name: 'password_reset', data: { name: user.name, link: passwordLink(opts, token), expiresMinutes: RESET_TTL_MINUTES } }, asLocale(user.locale), now);
  });
}

/** What a token link is for, without using it (for rendering the set-password page). */
export async function inspectPasswordToken(db: Db, token: string, now = new Date()): Promise<{ purpose: 'invite' | 'reset'; name: string; email: string; locale: string } | null> {
  const [row] = await db
    .select({ token: advertiserTokens, user: advertiserUsers })
    .from(advertiserTokens)
    .innerJoin(advertiserUsers, eq(advertiserUsers.id, advertiserTokens.advertiserUserId))
    .where(and(eq(advertiserTokens.tokenHash, hashToken(token)), isNull(advertiserTokens.usedAt), gt(advertiserTokens.expiresAt, now), isNull(advertiserUsers.disabledAt)));
  return row ? { purpose: row.token.purpose, name: row.user.name, email: row.user.email, locale: row.user.locale } : null;
}

/** Sets the password from an invite/reset link, burns the token and signs out every session. */
export async function setPasswordWithToken(db: Db, token: string, password: string, now = new Date()): Promise<{ ok: true; email: string } | { ok: false; reason: 'invalid_token' | 'weak_password' }> {
  if (password.length < 12) return { ok: false, reason: 'weak_password' };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ token: advertiserTokens, user: advertiserUsers })
      .from(advertiserTokens)
      .innerJoin(advertiserUsers, eq(advertiserUsers.id, advertiserTokens.advertiserUserId))
      .where(and(eq(advertiserTokens.tokenHash, hashToken(token)), isNull(advertiserTokens.usedAt), gt(advertiserTokens.expiresAt, now), isNull(advertiserUsers.disabledAt)))
      .for('update', { of: advertiserTokens });
    if (!row) return { ok: false, reason: 'invalid_token' } as const;
    await tx.update(advertiserUsers).set({ passwordHash: await hashPassword(password) }).where(eq(advertiserUsers.id, row.user.id));
    await tx.update(advertiserTokens).set({ usedAt: now }).where(and(eq(advertiserTokens.advertiserUserId, row.user.id), isNull(advertiserTokens.usedAt)));
    await tx.delete(advertiserSessions).where(eq(advertiserSessions.advertiserUserId, row.user.id));
    return { ok: true, email: row.user.email } as const;
  });
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

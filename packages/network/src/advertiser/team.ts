import { randomBytes } from 'node:crypto';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { newTotpSecret, totpUri, verifyTotp } from '@kiqro/core';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { hashPassword, verifyPassword } from '../admin/auth.ts';
import { enqueueEmail } from '../email/queue.ts';
import { localizedIssues, translateMessage, type FieldIssue, type UiLocale } from '../validation.ts';
import { INVITE_TTL_HOURS, issueToken, passwordLink, type AdvertiserSession, type AdvertiserUser, type LinkOptions } from './auth.ts';

const { advertiserSessions, advertiserUsers, auditLog } = schema;

export type TeamResult = { ok: true } | { ok: false; issues: FieldIssue[] };
const fail = (key: string, locale: UiLocale, path = ''): TeamResult => ({ ok: false, issues: [{ path, message: translateMessage(key, locale) }] });

async function auditTeam(db: DbOrTx, session: AdvertiserSession, action: string, entityId: string, details: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({
    id: newId('audit'),
    adminUserId: null,
    action,
    entityType: 'advertiser_user',
    entityId,
    details: { ...details, advertiserUserId: session.user.id, orgId: session.org.id },
  });
}

export const teamInviteInput = z.object({
  email: z.string().trim().toLowerCase().email('email_invalid'),
  name: z.string().trim().min(2, 'name_short').max(100),
  locale: z.enum(['en', 'tr']).default('en'),
  role: z.enum(['admin', 'member']).default('member'),
});

/** Members of the advertiser's team, oldest first; disabled users are left out. */
export async function listTeam(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(advertiserUsers)
    .where(and(eq(advertiserUsers.orgId, orgId), isNull(advertiserUsers.disabledAt)))
    .orderBy(asc(advertiserUsers.createdAt));
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    twoFactor: Boolean(u.totpEnabledAt),
    // Invited users have an unusable password until they open their link.
    pending: !u.lastLoginAt,
    lastLoginAt: u.lastLoginAt,
  }));
}

/** An admin of the advertiser invites a teammate by e-mail (same invite flow as Kiqro staff use). */
export async function inviteTeamMember(db: Db, session: AdvertiserSession, input: unknown, links: LinkOptions, locale: UiLocale, now = new Date()): Promise<TeamResult> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  const parsed = teamInviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: localizedIssues(parsed.error, locale) };
  const d = parsed.data;
  return db.transaction(async (tx) => {
    if (await tx.query.advertiserUsers.findFirst({ where: eq(advertiserUsers.email, d.email) })) return fail('email_taken', locale, 'email');
    const id = newId('advertiserUser');
    await tx.insert(advertiserUsers).values({
      id,
      orgId: session.org.id,
      email: d.email,
      name: d.name,
      locale: d.locale,
      role: d.role,
      invitedBy: session.user.id,
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
    });
    const token = await issueToken(tx, id, 'invite', INVITE_TTL_HOURS * 3_600_000, now);
    await enqueueEmail(tx, d.email, { name: 'advertiser_invite', data: { name: d.name, company: session.org.name, link: passwordLink(links, token), expiresHours: INVITE_TTL_HOURS } }, d.locale, now);
    await auditTeam(tx, session, 'advertiser.team.invite', id, { email: d.email, role: d.role });
    return { ok: true } as const;
  });
}

async function teammate(tx: DbOrTx, session: AdvertiserSession, userId: string): Promise<AdvertiserUser | undefined> {
  return tx.query.advertiserUsers.findFirst({ where: and(eq(advertiserUsers.id, userId), eq(advertiserUsers.orgId, session.org.id), isNull(advertiserUsers.disabledAt)) });
}

async function otherAdmins(tx: DbOrTx, orgId: string, exceptId: string): Promise<number> {
  const rows = await tx
    .select({ id: advertiserUsers.id })
    .from(advertiserUsers)
    .where(and(eq(advertiserUsers.orgId, orgId), eq(advertiserUsers.role, 'admin'), isNull(advertiserUsers.disabledAt), ne(advertiserUsers.id, exceptId)));
  return rows.length;
}

export async function resendTeamInvite(db: Db, session: AdvertiserSession, userId: string, links: LinkOptions, locale: UiLocale, now = new Date()): Promise<TeamResult> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  return db.transaction(async (tx) => {
    const user = await teammate(tx, session, userId);
    if (!user || user.lastLoginAt) return fail('team_not_found', locale);
    const token = await issueToken(tx, user.id, 'invite', INVITE_TTL_HOURS * 3_600_000, now);
    await enqueueEmail(tx, user.email, { name: 'advertiser_invite', data: { name: user.name, company: session.org.name, link: passwordLink(links, token), expiresHours: INVITE_TTL_HOURS } }, user.locale === 'tr' ? 'tr' : 'en', now);
    await auditTeam(tx, session, 'advertiser.team.invite_resent', user.id);
    return { ok: true } as const;
  });
}

/** Changes a teammate's role; the team always keeps at least one admin. */
export async function setTeamRole(db: Db, session: AdvertiserSession, userId: string, role: 'admin' | 'member', locale: UiLocale): Promise<TeamResult> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  return db.transaction(async (tx) => {
    const user = await teammate(tx, session, userId);
    if (!user) return fail('team_not_found', locale);
    if (role === 'member' && user.role === 'admin' && (await otherAdmins(tx, session.org.id, user.id)) === 0) return fail('team_last_admin', locale);
    await tx.update(advertiserUsers).set({ role }).where(eq(advertiserUsers.id, user.id));
    await auditTeam(tx, session, 'advertiser.team.role', user.id, { role });
    return { ok: true } as const;
  });
}

/** Removes a teammate: the login is disabled and signed out (kept for the audit trail). */
export async function removeTeamMember(db: Db, session: AdvertiserSession, userId: string, locale: UiLocale, now = new Date()): Promise<TeamResult> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  if (userId === session.user.id) return fail('team_not_self', locale);
  return db.transaction(async (tx) => {
    const user = await teammate(tx, session, userId);
    if (!user) return fail('team_not_found', locale);
    if (user.role === 'admin' && (await otherAdmins(tx, session.org.id, user.id)) === 0) return fail('team_last_admin', locale);
    await tx.update(advertiserUsers).set({ disabledAt: now }).where(eq(advertiserUsers.id, user.id));
    await tx.delete(advertiserSessions).where(eq(advertiserSessions.advertiserUserId, user.id));
    await auditTeam(tx, session, 'advertiser.team.remove', user.id, { email: user.email });
    return { ok: true } as const;
  });
}

// ---------- Two-factor authentication (optional, per user) ----------

/**
 * Starts 2FA setup: stores a new secret (not yet active) and returns it for the QR code.
 * Refused while 2FA is on, so a session alone can never replace or switch off the secret.
 */
export async function startAdvertiserTotp(db: Db, user: AdvertiserUser): Promise<{ secret: string; uri: string } | null> {
  const secret = newTotpSecret();
  const updated = await db
    .update(advertiserUsers)
    .set({ totpSecret: secret })
    .where(and(eq(advertiserUsers.id, user.id), isNull(advertiserUsers.totpEnabledAt)))
    .returning({ id: advertiserUsers.id });
  return updated.length ? { secret, uri: totpUri(secret, user.email, 'Kiqro Advertiser') } : null;
}

/** Turns 2FA on once the user proves their authenticator app shows the right code. */
export async function confirmAdvertiserTotp(db: Db, session: AdvertiserSession, code: string, locale: UiLocale, now = new Date()): Promise<TeamResult> {
  const fresh = await db.query.advertiserUsers.findFirst({ where: eq(advertiserUsers.id, session.user.id) });
  if (!fresh?.totpSecret || fresh.totpEnabledAt) return fail('totp_not_started', locale);
  if (!verifyTotp(fresh.totpSecret, code.replace(/\s/g, ''), now)) return fail('totp_wrong_code', locale, 'code');
  await db.transaction(async (tx) => {
    await tx.update(advertiserUsers).set({ totpEnabledAt: now }).where(eq(advertiserUsers.id, fresh.id));
    await auditTeam(tx, session, 'advertiser.totp_enabled', fresh.id);
  });
  return { ok: true };
}

/** Turns 2FA off; needs the password and a current code, so a stolen session alone cannot. */
export async function disableAdvertiserTotp(db: Db, session: AdvertiserSession, password: string, code: string, locale: UiLocale, now = new Date()): Promise<TeamResult> {
  const fresh = await db.query.advertiserUsers.findFirst({ where: eq(advertiserUsers.id, session.user.id) });
  if (!fresh?.totpEnabledAt || !fresh.totpSecret) return fail('totp_not_started', locale);
  if (!(await verifyPassword(password, fresh.passwordHash))) return fail('password_wrong', locale, 'password');
  if (!verifyTotp(fresh.totpSecret, code.replace(/\s/g, ''), now)) return fail('totp_wrong_code', locale, 'code');
  await db.transaction(async (tx) => {
    await tx.update(advertiserUsers).set({ totpSecret: null, totpEnabledAt: null }).where(eq(advertiserUsers.id, fresh.id));
    await auditTeam(tx, session, 'advertiser.totp_disabled', fresh.id);
  });
  return { ok: true };
}

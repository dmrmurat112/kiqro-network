import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { sign, totp } from '@kiqro/core';
import { schema, topUpAdvertiser, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createDemoSetup, deliverDueEmails, enqueueEmail, handleClick, handlePostback, renderEmail, sendgridMailer, type DemoSetup, type Mailer } from '../src/index.ts';
import { createAdminUser, type AdminUser } from '../src/admin/index.ts';
import {
  advertiserCampaigns,
  advertiserConversions,
  advertiserCountries,
  advertiserDailySeries,
  acceptAdvertiserTerms,
  advertiserLogin,
  advertiserOverview,
  checkLowBalances,
  confirmAdvertiserTotp,
  disableAdvertiserTotp,
  inviteTeamMember,
  listTeam,
  removeTeamMember,
  setTeamRole,
  startAdvertiserTotp,
  conversionsCsv,
  createAdvertiserUser,
  getAdvertiserSession,
  inspectPasswordToken,
  requestPasswordReset,
  resendAdvertiserInvite,
  setPasswordWithToken,
  submitLead,
} from '../src/advertiser/index.ts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

const NOW = new Date('2026-11-04T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

async function staff(): Promise<AdminUser> {
  const id = await createAdminUser(db, { email: `a${Math.random()}@kiqro.test`, name: 'Ops', role: 'operator', password: 'correct horse battery' });
  return (await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, id) }))!;
}

async function convert(s: DemoSetup, user: string, event: string, clickAt: Date, eventAt: Date) {
  const c = await handleClick(db, {
    campaignId: s.campaignId, appKey: s.appKey, publisherUserId: user, signature: sign(s.placementSecret, [s.campaignId, user]),
    country: 'TR', ip: null, userAgent: null, query: {}, now: clickAt,
  });
  if (!c.ok) throw new Error(c.reason);
  return handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: c.clickId, event }, url: '/', ip: null, now: eventAt });
}

const LINKS = { advertiseBaseUrl: 'https://advertise.test' };

/** Pulls the newest link sent to an address out of the e-mail queue, like a user clicking it. */
async function tokenFromInbox(to: string): Promise<string> {
  const [mail] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.to, to)).orderBy(desc(schema.emailMessages.createdAt)).limit(1);
  const token = /set-password\?token=([\w-]+)/.exec(mail!.text)?.[1];
  if (!token) throw new Error('no link in e-mail');
  return token;
}

describe('advertiser accounts', () => {
  it('invites by e-mail, lets the user choose a password and opens an organization-scoped session', async () => {
    const s = await createDemoSetup(db);
    await createAdvertiserUser(db, await staff(), s.advertiserId, { email: 'ua@studio.test', name: 'UA Lead', locale: 'tr' }, LINKS);
    const [mail] = await db.select().from(schema.emailMessages);
    expect(mail).toMatchObject({ to: 'ua@studio.test', template: 'advertiser_invite', status: 'pending' });
    expect(mail!.subject).toContain('hesabınız hazır');

    const token = await tokenFromInbox('ua@studio.test');
    expect(await inspectPasswordToken(db, token)).toMatchObject({ purpose: 'invite', email: 'ua@studio.test' });
    expect(await setPasswordWithToken(db, token, 'short')).toEqual({ ok: false, reason: 'weak_password' });
    expect(await setPasswordWithToken(db, token, 'a long enough password')).toMatchObject({ ok: true });
    expect(await setPasswordWithToken(db, token, 'a long enough password')).toEqual({ ok: false, reason: 'invalid_token' });

    expect((await advertiserLogin(db, { email: 'ua@studio.test', password: 'wrong-password', ip: null })).status).toBe('invalid');
    const result = await advertiserLogin(db, { email: 'UA@studio.test', password: 'a long enough password', ip: null });
    if (result.status !== 'ok') throw new Error(result.status);
    expect((await getAdvertiserSession(db, result.token))?.org.id).toBe(s.advertiserId);

    await db.update(schema.organizations).set({ status: 'suspended' }).where(eq(schema.organizations.id, s.advertiserId));
    expect(await getAdvertiserSession(db, result.token)).toBeNull();
  });

  it('resets passwords: silent for unknown e-mails, single-use, expiring, signs out sessions, rate limited', async () => {
    const s = await createDemoSetup(db);
    const actor = await staff();
    await createAdvertiserUser(db, actor, s.advertiserId, { email: 'ops@studio.test', name: 'Ops' }, LINKS);
    await setPasswordWithToken(db, await tokenFromInbox('ops@studio.test'), 'first password 123');
    const login = await advertiserLogin(db, { email: 'ops@studio.test', password: 'first password 123', ip: null });
    if (login.status !== 'ok') throw new Error(login.status);

    await requestPasswordReset(db, 'nobody@studio.test', LINKS);
    expect(await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.to, 'nobody@studio.test'))).toHaveLength(0);

    const now = new Date();
    await requestPasswordReset(db, 'OPS@studio.test', LINKS, now);
    const token = await tokenFromInbox('ops@studio.test');
    expect(await inspectPasswordToken(db, token, new Date(now.getTime() + 61 * 60_000))).toBeNull(); // expired after 60 min
    expect(await setPasswordWithToken(db, token, 'second password 456', now)).toMatchObject({ ok: true });
    expect(await getAdvertiserSession(db, login.token)).toBeNull(); // old sessions are signed out

    await requestPasswordReset(db, 'ops@studio.test', LINKS, now);
    await requestPasswordReset(db, 'ops@studio.test', LINKS, now);
    await requestPasswordReset(db, 'ops@studio.test', LINKS, now);
    const resets = (await db.select().from(schema.emailMessages)).filter((m) => m.template === 'password_reset');
    expect(resets).toHaveLength(3); // the 4th request in the hour is ignored
  });

  it('refuses duplicate e-mails and re-sends invitations with a new link', async () => {
    const s = await createDemoSetup(db);
    const actor = await staff();
    const { id } = await createAdvertiserUser(db, actor, s.advertiserId, { email: 'x@studio.test', name: 'Xavi' }, LINKS);
    await expect(createAdvertiserUser(db, actor, s.advertiserId, { email: 'x@studio.test', name: 'Yuki' }, LINKS)).rejects.toThrow('zaten');
    const first = await tokenFromInbox('x@studio.test');
    await new Promise((r) => setTimeout(r, 5));
    await resendAdvertiserInvite(db, actor, id, LINKS);
    expect(await inspectPasswordToken(db, first)).toBeNull(); // the previous link stops working
    expect(await inspectPasswordToken(db, await tokenFromInbox('x@studio.test'))).toMatchObject({ purpose: 'invite' });
  });
});

describe('e-mail delivery and alerts', () => {
  it('delivers queued mail, retries failures and stops on permanent errors', async () => {
    await enqueueEmail(db, 'a@studio.test', { name: 'password_reset', data: { name: 'A', link: 'https://x.test', expiresMinutes: 60 } }, 'en');
    await enqueueEmail(db, 'b@studio.test', { name: 'password_reset', data: { name: 'B', link: 'https://x.test', expiresMinutes: 60 } }, 'en');
    const mailer: Mailer = {
      send: async (m) => (m.to === 'a@studio.test' ? { ok: true, providerMessageId: 'sg-1' } : { ok: false, error: 'SendGrid 400: bad', permanent: true }),
    };
    expect(await deliverDueEmails(db, mailer)).toBe(2);
    const rows = await db.select().from(schema.emailMessages);
    expect(rows.find((r) => r.to === 'a@studio.test')).toMatchObject({ status: 'sent', providerMessageId: 'sg-1' });
    expect(rows.find((r) => r.to === 'b@studio.test')).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('builds the SendGrid request without click tracking and maps responses', async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | undefined;
    const mailer = sendgridMailer({
      apiKey: 'SG.key',
      from: 'noreply@kiqro.com',
      fromName: 'Kiqro Network',
      fetcher: async (url, init) => {
        sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization! };
        return { status: 202, headers: { get: () => 'msg-123' }, text: async () => '' };
      },
    });
    expect(await mailer.send({ to: 'a@b.test', subject: 'S', html: '<p>h</p>', text: 't', category: 'password_reset' })).toEqual({ ok: true, providerMessageId: 'msg-123' });
    expect(sent!.url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(sent!.auth).toBe('Bearer SG.key');
    expect(sent!.body).toMatchObject({ from: { email: 'noreply@kiqro.com' }, categories: ['password_reset'], tracking_settings: { click_tracking: { enable: false } } });
  });

  it('escapes user input in templates', () => {
    const mail = renderEmail({ name: 'password_reset', data: { name: '<script>x</script>', link: 'https://x.test', expiresMinutes: 60 } }, 'en');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('alerts once per day below the threshold and re-arms after a top-up', async () => {
    const s = await createDemoSetup(db, { topUpUsd: '50' });
    const actor = await staff();
    await createAdvertiserUser(db, actor, s.advertiserId, { email: 'fin@studio.test', name: 'Fin' }, LINKS);
    const now = new Date();
    expect(await checkLowBalances(db, LINKS, now)).toBe(1);
    expect(await checkLowBalances(db, LINKS, new Date(now.getTime() + 3_600_000))).toBe(0);
    const alerts = () => db.select().from(schema.emailMessages).where(eq(schema.emailMessages.template, 'low_balance'));
    expect((await alerts())[0]!.subject).toContain('$50.00');

    await topUpAdvertiser(db, s.advertiserId, 500_000_000n);
    expect(await checkLowBalances(db, LINKS, new Date(now.getTime() + 2 * 3_600_000))).toBe(0);
    const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, s.advertiserId) });
    expect(org!.lowBalanceAlertedAt).toBeNull();
    expect(await alerts()).toHaveLength(1);
  });

  it('notifies the sales inbox about demo requests', async () => {
    const lead = { name: 'Aino', email: 'aino@studio.fi', company: 'Studio Oy', locale: 'en' };
    await submitLead(db, lead, null, { to: 'ads@kiqro.test', adminBaseUrl: 'https://admin.test' });
    const [mail] = await db.select().from(schema.emailMessages);
    expect(mail).toMatchObject({ to: 'ads@kiqro.test', template: 'lead_notification' });
    expect(mail!.text).toContain('https://admin.test/leads');
  });
});

describe('advertiser reports', () => {
  it('reports only the advertiser’s own data, with totals, daily series, funnel and countries', async () => {
    const mine = await createDemoSetup(db);
    const other = await createDemoSetup(db);
    await convert(mine, 'u1', 'install', ago(120), ago(119));
    await convert(mine, 'u2', 'install', ago(60), ago(59.9)); // 6 s CTIT → rejected, not billed
    await convert(other, 'u9', 'install', ago(60), ago(59));

    const overview = await advertiserOverview(db, mine.advertiserId, 7, NOW);
    expect(overview.current).toEqual({ spend: 400_000n, installs: 1, events: 0, filtered: 1 });
    expect(overview.balance).toBe(999_600_000n);
    expect(overview.clicks).toBe(2);

    const series = await advertiserDailySeries(db, mine.advertiserId, 7, NOW);
    expect(series).toHaveLength(7);
    expect(series.at(-1)).toMatchObject({ date: '2026-11-04', spend: 400_000n, installs: 1 });

    const [campaign] = await advertiserCampaigns(db, mine.advertiserId);
    expect(campaign!.clicks).toBe(2);
    expect(campaign!.tasks[0]).toMatchObject({ event: 'install', completions: 1, spend: 400_000n });

    expect(await advertiserCountries(db, mine.advertiserId, 7, NOW)).toEqual([{ country: 'TR', spend: 400_000n, installs: 1 }]);

    const log = await advertiserConversions(db, mine.advertiserId);
    expect(log.map((r) => r.status).sort()).toEqual(['billed', 'not_billed']);
    expect(log.find((r) => r.status === 'not_billed')).toMatchObject({ reason: 'timing', price: 0n });
    expect(await advertiserConversions(db, mine.advertiserId, { status: 'billed' })).toHaveLength(1);

    const csv = conversionsCsv(log);
    expect(csv.split('\n')[0]).toBe('time_utc,conversion_id,click_id,campaign,event,country,status,reason,billed_usd');
    expect(csv).toContain(',billed,,0.400000');
  });
});

describe('leads', () => {
  it('validates, stores and throttles demo requests', async () => {
    const lead = { name: 'Aino', email: 'aino@studio.fi', company: 'Studio Oy', vertical: 'games', monthlyBudget: '5k-20k', locale: 'en' };
    expect(await submitLead(db, { ...lead, email: 'nope' }, '203.0.113.5', undefined, NOW)).toMatchObject({ ok: false, error: 'invalid', fields: ['email'] });
    for (let i = 0; i < 5; i++) expect((await submitLead(db, lead, '203.0.113.5', undefined, NOW)).ok).toBe(true);
    expect(await submitLead(db, lead, '203.0.113.5', undefined, NOW)).toEqual({ ok: false, error: 'rate_limited' });
  });
});

describe('terms acceptance', () => {
  it('records the accepted version with time and IP, and audits it', async () => {
    const s = await createDemoSetup(db);
    const { id } = await createAdvertiserUser(db, await staff(), s.advertiserId, { email: 'legal@studio.test', name: 'Legal' }, LINKS);
    const user = (await db.query.advertiserUsers.findFirst({ where: eq(schema.advertiserUsers.id, id) }))!;
    expect(user.termsAcceptedVersion).toBeNull();
    await acceptAdvertiserTerms(db, user, '1.0', '203.0.113.9', NOW);
    const after = (await db.query.advertiserUsers.findFirst({ where: eq(schema.advertiserUsers.id, id) }))!;
    expect(after).toMatchObject({ termsAcceptedVersion: '1.0', termsAcceptedIp: '203.0.113.9', termsAcceptedAt: NOW });
    const [entry] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'advertiser_user.accept_terms'));
    expect(entry).toMatchObject({ entityId: id, details: { version: '1.0', ip: '203.0.113.9' } });
  });
});

describe('advertiser team and two-factor authentication', () => {
  async function signIn(email: string) {
    const login = await advertiserLogin(db, { email, password: 'long enough password', ip: null });
    if (login.status !== 'ok') throw new Error(login.status);
    return (await getAdvertiserSession(db, login.token))!;
  }

  async function owner() {
    const s = await createDemoSetup(db);
    await createAdvertiserUser(db, await staff(), s.advertiserId, { email: 'owner@studio.test', name: 'Owner' }, LINKS);
    await setPasswordWithToken(db, await tokenFromInbox('owner@studio.test'), 'long enough password');
    return signIn('owner@studio.test');
  }

  it('lets admins invite, promote and remove teammates, keeping at least one admin', async () => {
    const me = await owner();
    expect(me.user.role).toBe('admin');
    expect(await inviteTeamMember(db, me, { email: 'ua@studio.test', name: 'UA Manager', role: 'member' }, LINKS, 'en')).toEqual({ ok: true });
    expect(await inviteTeamMember(db, me, { email: 'ua@studio.test', name: 'Again' }, LINKS, 'en')).toMatchObject({ ok: false, issues: [{ path: 'email' }] });
    await setPasswordWithToken(db, await tokenFromInbox('ua@studio.test'), 'long enough password');
    const ua = await signIn('ua@studio.test');
    expect(ua.user).toMatchObject({ role: 'member', invitedBy: me.user.id, orgId: me.org.id });

    // Members cannot manage the team; the last admin cannot step down or be removed.
    expect(await inviteTeamMember(db, ua, { email: 'x@studio.test', name: 'X' }, LINKS, 'en')).toMatchObject({ ok: false });
    expect(await setTeamRole(db, me, me.user.id, 'member', 'tr')).toMatchObject({ ok: false, issues: [{ message: 'ekipte en az bir yönetici kalmalı' }] });
    expect(await removeTeamMember(db, me, me.user.id, 'en')).toMatchObject({ ok: false });

    expect(await setTeamRole(db, me, ua.user.id, 'admin', 'en')).toEqual({ ok: true });
    expect((await listTeam(db, me.org.id)).map((u) => [u.email, u.role])).toEqual([['owner@studio.test', 'admin'], ['ua@studio.test', 'admin']]);

    // Removing signs the teammate out and blocks new sign-ins.
    const login = await advertiserLogin(db, { email: 'ua@studio.test', password: 'long enough password', ip: null });
    expect(await removeTeamMember(db, me, ua.user.id, 'en')).toEqual({ ok: true });
    expect(await getAdvertiserSession(db, (login as { token: string }).token)).toBeNull();
    expect((await advertiserLogin(db, { email: 'ua@studio.test', password: 'long enough password', ip: null })).status).toBe('invalid');
    expect(await listTeam(db, me.org.id)).toHaveLength(1);
  });

  it('asks for an authenticator code once 2FA is on, and needs password and code to turn it off', async () => {
    const me = await owner();
    const { secret, uri } = (await startAdvertiserTotp(db, me.user))!;
    expect(uri).toContain('otpauth://totp/');
    expect(await confirmAdvertiserTotp(db, me, '000000', 'en', NOW)).toMatchObject({ ok: false });
    expect(await confirmAdvertiserTotp(db, me, totp(secret, new Date()), 'en')).toEqual({ ok: true });

    expect((await advertiserLogin(db, { email: 'owner@studio.test', password: 'long enough password', ip: null })).status).toBe('totp_required');
    expect((await advertiserLogin(db, { email: 'owner@studio.test', password: 'long enough password', totpCode: '123456', ip: null })).status).toBe('invalid');
    expect((await advertiserLogin(db, { email: 'owner@studio.test', password: 'long enough password', totpCode: totp(secret, new Date()), ip: null })).status).toBe('ok');
    expect((await listTeam(db, me.org.id))[0]!.twoFactor).toBe(true);
    expect(await startAdvertiserTotp(db, me.user)).toBeNull(); // cannot be reset without password and code

    expect(await disableAdvertiserTotp(db, me, 'wrong password!!', totp(secret, new Date()), 'en')).toMatchObject({ ok: false, issues: [{ path: 'password' }] });
    expect(await disableAdvertiserTotp(db, me, 'long enough password', totp(secret, new Date()), 'en')).toEqual({ ok: true });
    expect((await advertiserLogin(db, { email: 'owner@studio.test', password: 'long enough password', ip: null })).status).toBe('ok');
  });
});

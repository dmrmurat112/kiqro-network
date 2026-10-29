import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createDemoSetup, handleClick, handlePostback, type DemoSetup } from '../src/index.ts';
import { createAdminUser, type AdminUser } from '../src/admin/index.ts';
import {
  advertiserCampaigns,
  advertiserConversions,
  advertiserCountries,
  advertiserDailySeries,
  advertiserLogin,
  advertiserOverview,
  conversionsCsv,
  createAdvertiserUser,
  getAdvertiserSession,
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

describe('advertiser accounts', () => {
  it('creates a login with a one-time password and opens a session scoped to the organization', async () => {
    const s = await createDemoSetup(db);
    const { password } = await createAdvertiserUser(db, await staff(), s.advertiserId, { email: 'ua@studio.test', name: 'UA Lead', locale: 'en' });
    expect((await advertiserLogin(db, { email: 'ua@studio.test', password: 'wrong-password', ip: null })).status).toBe('invalid');
    const result = await advertiserLogin(db, { email: 'UA@studio.test', password, ip: null });
    if (result.status !== 'ok') throw new Error(result.status);
    const session = await getAdvertiserSession(db, result.token);
    expect(session?.org.id).toBe(s.advertiserId);

    await db.update(schema.organizations).set({ status: 'suspended' }).where(eq(schema.organizations.id, s.advertiserId));
    expect(await getAdvertiserSession(db, result.token)).toBeNull();
  });

  it('refuses duplicate e-mails', async () => {
    const s = await createDemoSetup(db);
    const actor = await staff();
    await createAdvertiserUser(db, actor, s.advertiserId, { email: 'x@studio.test', name: 'Xavi' });
    await expect(createAdvertiserUser(db, actor, s.advertiserId, { email: 'x@studio.test', name: 'Yuki' })).rejects.toThrow('zaten');
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
    expect(await submitLead(db, { ...lead, email: 'nope' }, '203.0.113.5', NOW)).toMatchObject({ ok: false, error: 'invalid', fields: ['email'] });
    for (let i = 0; i < 5; i++) expect((await submitLead(db, lead, '203.0.113.5', NOW)).ok).toBe(true);
    expect(await submitLead(db, lead, '203.0.113.5', NOW)).toEqual({ ok: false, error: 'rate_limited' });
  });
});

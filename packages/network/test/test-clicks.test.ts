import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { getAccountId, getBalance, schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createAdminUser, rotatePostbackSecret, type AdminUser } from '../src/admin/index.ts';
import { ADVERTISER_TEST_CLICKS_PER_DAY, createAdvertiserTestClick, createDemoSetup, createTestClick, handlePostback, listTestClicks, reverseConversion, TEST_PLACEMENT_ID } from '../src/index.ts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

const T0 = new Date('2026-11-25T09:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

async function staff(role: AdminUser['role'] = 'operator'): Promise<AdminUser> {
  const id = await createAdminUser(db, { email: `${role}-${Math.random()}@kiqro.test`, name: role, role, password: 'correct horse battery' });
  return (await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, id) }))!;
}

describe('admin test clicks', () => {
  it('approves postbacks on a test click for free and passes nothing on to a publisher', async () => {
    const s = await createDemoSetup(db);
    const balance = () => getAccountId(db, 'advertiser_balance', s.advertiserId).then((id) => getBalance(db, id));
    const before = await balance();
    // Works on a paused campaign too.
    await db.update(schema.campaigns).set({ status: 'paused' }).where(eq(schema.campaigns.id, s.campaignId));

    const clickId = await createTestClick(db, await staff(), s.campaignId, T0);
    const click = (await db.query.clicks.findFirst({ where: eq(schema.clicks.id, clickId) }))!;
    expect(click.placementId).toBe(TEST_PLACEMENT_ID);

    const post = (event: string, s2: number) => handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: clickId, event }, url: '/', ip: null, now: at(s2) });
    expect(await post('install', 60)).toMatchObject({ httpStatus: 200, outcome: 'approved' });
    expect(await post('af_level_achieved_10', 3600)).toMatchObject({ outcome: 'approved' });

    const rows = await db.select().from(schema.conversions).where(eq(schema.conversions.clickId, clickId));
    expect(rows.map((r) => [r.advertiserPrice, r.publisherPayout, r.reasons])).toEqual([
      [0n, 0n, ['test_click']],
      [0n, 0n, ['test_click']],
    ]);
    expect(await balance()).toBe(before);
    expect(await db.select().from(schema.publisherPostbacks)).toHaveLength(0);

    const [listed] = await listTestClicks(db, { campaignId: s.campaignId });
    expect(listed!.events.map((e) => [e.event, e.status])).toEqual([
      ['install', 'approved'],
      ['af_level_achieved_10', 'approved'],
    ]);

    // Reversing a free conversion works and still moves no money.
    expect(await reverseConversion(db, { advertiserKey: s.postbackKey, clickId, eventName: 'install', reason: 'test', now: at(7200) })).toMatchObject({ ok: true });
    expect(await balance()).toBe(before);
  });

  it('only staff who manage campaigns create test clicks', async () => {
    const s = await createDemoSetup(db);
    await expect(createTestClick(db, await staff('viewer'), s.campaignId)).rejects.toThrow();
    await expect(createTestClick(db, await staff(), 'cmp_missing')).rejects.toThrow();
  });
});

describe('advertiser test clicks (panel)', () => {
  it('works only on the advertiser’s own, non-archived campaigns', async () => {
    const own = await createDemoSetup(db);
    const other = await createDemoSetup(db);
    const ok = await createAdvertiserTestClick(db, own.advertiserId, own.campaignId, T0);
    expect(ok).toMatchObject({ ok: true, ctitMinSeconds: 10 });
    expect(await createAdvertiserTestClick(db, own.advertiserId, other.campaignId, T0)).toEqual({ ok: false, reason: 'not_found' });
    await db.update(schema.campaigns).set({ status: 'archived' }).where(eq(schema.campaigns.id, own.campaignId));
    expect(await createAdvertiserTestClick(db, own.advertiserId, own.campaignId, T0)).toEqual({ ok: false, reason: 'not_found' });

    const listed = await listTestClicks(db, { orgId: own.advertiserId });
    expect(listed.map((c) => c.id)).toEqual([(ok as { clickId: string }).clickId]);
    expect(await listTestClicks(db, { orgId: other.advertiserId })).toEqual([]);
  });

  it('allows a limited number of test clicks per day', async () => {
    const s = await createDemoSetup(db);
    for (let i = 0; i < ADVERTISER_TEST_CLICKS_PER_DAY; i++) expect((await createAdvertiserTestClick(db, s.advertiserId, s.campaignId, at(i))).ok).toBe(true);
    expect(await createAdvertiserTestClick(db, s.advertiserId, s.campaignId, at(100))).toEqual({ ok: false, reason: 'limit' });
    expect((await createAdvertiserTestClick(db, s.advertiserId, s.campaignId, at(86_400 + 60))).ok).toBe(true);
  });
});

describe('postback signing secret', () => {
  it('can be created for an account without one, and rotating it retires the old secret', async () => {
    const s = await createDemoSetup(db);
    const actor = await staff();
    const clickId = await createTestClick(db, actor, s.campaignId, T0);
    const post = (sig?: string) => handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: clickId, event: 'install', sig }, url: '/', ip: null, now: at(60) });

    await rotatePostbackSecret(db, actor, s.advertiserId);
    const first = (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, s.advertiserId) }))!.postbackSecret!;
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(await post()).toMatchObject({ httpStatus: 403, outcome: 'invalid_signature' });

    await rotatePostbackSecret(db, actor, s.advertiserId);
    const second = (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, s.advertiserId) }))!.postbackSecret!;
    expect(second).not.toBe(first);
    expect(await post(sign(first, [clickId, 'install']))).toMatchObject({ outcome: 'invalid_signature' });
    expect(await post(sign(second, [clickId, 'install']))).toMatchObject({ outcome: 'approved' });

    const audit = await db.select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.entityId, s.advertiserId));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['advertiser.postback_secret_created', 'advertiser.postback_secret_rotated']));
    await expect(rotatePostbackSecret(db, await staff('viewer'), s.advertiserId)).rejects.toThrow();
  });
});

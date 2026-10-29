import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { postTransaction, getAccountId, schema, type Db } from '@kiqro/db';
import { createDemoSetup, type DemoOptions, type DemoSetup } from '../src/fixtures.ts';
import { handleClick } from '../src/clicks.ts';
import { handlePostback, reverseConversion } from '../src/conversions.ts';
import { deliverDuePostbacks, MAX_ATTEMPTS } from '../src/outbox.ts';
import { balanceOf, resetDb, server, setupDb } from './helpers.ts';

const { conversions, publisherPostbacks } = schema;

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => ({ db, close } = await setupDb()));
afterAll(async () => close());
beforeEach(async () => resetDb(db));

const T0 = new Date('2026-11-02T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const DAY = 86_400;

async function click(s: DemoSetup, opts: { user?: string; country?: string | null; now?: Date } = {}) {
  const user = opts.user ?? 'user-1';
  const result = await handleClick(db, {
    campaignId: s.campaignId,
    appKey: s.appKey,
    publisherUserId: user,
    signature: sign(s.placementSecret, [s.campaignId, user]),
    country: opts.country === undefined ? 'TR' : opts.country,
    ip: '203.0.113.7',
    userAgent: 'test',
    query: { sub1: 'wall' },
    now: opts.now ?? T0,
  });
  if (!result.ok) throw new Error(`click failed: ${result.reason}`);
  return result.clickId;
}

function postback(s: DemoSetup, clickId: string, event: string, now: Date, extra: Record<string, string> = {}) {
  return handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: clickId, event, ...extra }, url: '/test', ip: null, now });
}

async function setup(opts?: DemoOptions) {
  return createDemoSetup(db, opts);
}

describe('offers API', () => {
  it('lists active offers with rewards in the publisher currency and signed click URLs', async () => {
    const s = await setup();
    const res = await server(db).inject({
      url: `/v1/offers?app_key=${s.appKey}&user_id=u1&country=TR&lang=tr&sig=${sign(s.placementSecret, [s.appKey, 'u1'])}`,
    });
    expect(res.statusCode).toBe(200);
    const [offer] = res.json().offers;
    // 70% revshare, 1000 points per USD: 0.40 → 280, 2.20 → 1540, 6.00 → 4200
    expect(offer.tasks.map((t: { rewardPoints: string }) => t.rewardPoints)).toEqual(['280', '1540', '4200']);
    expect(offer.totalRewardPoints).toBe('6020');
    expect(offer.tasks[1].name).toBe('10. seviyeye ulaş');
    expect(offer.clickUrl).toContain(`/c/${s.campaignId}?app_key=${s.appKey}&uid=u1&sig=`);
  });

  it('uses country prices and hides offers for untargeted countries', async () => {
    const s = await setup();
    const sig = sign(s.placementSecret, [s.appKey, 'u1']);
    const de = await server(db).inject({ url: `/v1/offers?app_key=${s.appKey}&user_id=u1&country=DE&sig=${sig}` });
    expect(de.json().offers[0].tasks[1].rewardPoints).toBe('2100'); // 3.00 * 0.7 * 1000
    const us = await server(db).inject({ url: `/v1/offers?app_key=${s.appKey}&user_id=u1&country=US&sig=${sig}` });
    expect(us.json().offers).toEqual([]);
  });

  it('rejects a bad signature', async () => {
    const s = await setup();
    const res = await server(db).inject({ url: `/v1/offers?app_key=${s.appKey}&user_id=u1&country=TR&sig=00` });
    expect(res.statusCode).toBe(403);
  });
});

describe('clicks', () => {
  it('redirects to the tracking URL with macros filled and reuses the click for repeat visits', async () => {
    const s = await setup();
    const url = `/c/${s.campaignId}?app_key=${s.appKey}&uid=u1&sub1=wall&sig=${sign(s.placementSecret, [s.campaignId, 'u1'])}`;
    const first = await server(db).inject({ url, headers: { 'cf-ipcountry': 'TR' } });
    expect(first.statusCode).toBe(302);
    const location = new URL(first.headers.location as string);
    const clickId = location.searchParams.get('clickid');
    expect(clickId).toMatch(/^clk_/);
    expect(location.searchParams.get('af_sub1')).toBe('wall');

    const second = await server(db).inject({ url, headers: { 'cf-ipcountry': 'TR' } });
    expect(new URL(second.headers.location as string).searchParams.get('clickid')).toBe(clickId);
  });

  it('refuses untargeted countries, unknown countries and bad signatures', async () => {
    const s = await setup();
    const sig = sign(s.placementSecret, [s.campaignId, 'u1']);
    const base = `/c/${s.campaignId}?app_key=${s.appKey}&uid=u1`;
    expect((await server(db).inject({ url: `${base}&sig=${sig}`, headers: { 'cf-ipcountry': 'US' } })).statusCode).toBe(409);
    expect((await server(db).inject({ url: `${base}&sig=${sig}` })).statusCode).toBe(409);
    expect((await server(db).inject({ url: `${base}&sig=abcd`, headers: { 'cf-ipcountry': 'TR' } })).statusCode).toBe(403);
  });

  it('stops new users when the budget is spent', async () => {
    const s = await setup({ totalBudgetUsd: '0.40' });
    const clickId = await click(s);
    expect((await postback(s, clickId, 'install', at(60))).outcome).toBe('approved');
    await expect(click(s, { user: 'user-2', now: at(120) })).rejects.toThrow('budget_exhausted');
  });
});

describe('conversions', () => {
  it('approves an install, posts a balanced ledger transaction and queues the publisher postback', async () => {
    const s = await setup();
    const clickId = await click(s);
    const result = await postback(s, clickId, 'install', at(60));
    expect(result.outcome).toBe('approved');

    expect(await balanceOf(db, 'advertiser_balance', s.advertiserId)).toBe(999_600_000n);
    expect(await balanceOf(db, 'publisher_payable', s.publisherId)).toBe(280_000n);
    expect(await balanceOf(db, 'kiqro_revenue', null)).toBe(120_000n);

    const [queued] = await db.select().from(publisherPostbacks);
    const url = new URL(queued!.url);
    expect(url.searchParams.get('amount')).toBe('280');
    expect(url.searchParams.get('status')).toBe('1');
    expect(url.searchParams.get('sig')).toBe(sign(s.placementSecret, ['user-1', '280', result.conversionId!, 1]));
  });

  it('rejects installs faster than the minimum click-to-install time', async () => {
    const s = await setup();
    const clickId = await click(s);
    const result = await postback(s, clickId, 'install', at(3));
    expect(result).toMatchObject({ outcome: 'rejected', reasons: ['ctit_too_short'] });
    expect(await balanceOf(db, 'kiqro_revenue', null)).toBe(0n);
    expect(await db.select().from(publisherPostbacks)).toHaveLength(0);
  });

  it('pays in-app events only after an attributed install and within the task time limit', async () => {
    const s = await setup();
    const clickId = await click(s);
    expect((await postback(s, clickId, 'af_level_achieved_10', at(100))).reasons).toEqual(['install_not_attributed']);

    const other = await click(s, { user: 'user-2' });
    await postback(s, other, 'install', at(60));
    expect((await postback(s, other, 'af_level_achieved_10', at(60 + 3 * DAY))).outcome).toBe('approved');
    expect((await postback(s, other, 'af_purchase', at(60 + 15 * DAY))).reasons).toEqual(['task_time_limit_exceeded']);
  });

  it('ignores a repeated postback for the same click and event', async () => {
    const s = await setup();
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));
    expect((await postback(s, clickId, 'install', at(70))).outcome).toBe('duplicate');
    expect(await db.select().from(conversions)).toHaveLength(1);
  });

  it('rewards a publisher user only once per task across clicks', async () => {
    const s = await setup();
    const first = await click(s);
    await postback(s, first, 'install', at(60));
    const second = await click(s, { now: at(8 * DAY) }); // outside the 7-day window, so a new click
    expect(second).not.toBe(first);
    expect((await postback(s, second, 'install', at(8 * DAY + 60))).reasons).toEqual(['duplicate_user']);
  });

  it('holds conversions the advertiser balance cannot cover and holds country mismatches', async () => {
    const s = await setup({ topUpUsd: '0.10' });
    const clickId = await click(s);
    expect(await postback(s, clickId, 'install', at(60))).toMatchObject({ outcome: 'held', reasons: ['insufficient_balance'] });

    const rich = await setup();
    const other = await click(rich);
    expect(await postback(rich, other, 'install', at(60), { country: 'DE' })).toMatchObject({ outcome: 'held', reasons: ['country_mismatch'] });
  });

  it('records unknown clicks, unknown events and foreign advertisers without paying', async () => {
    const s = await setup();
    const other = await setup();
    const clickId = await click(s);
    expect((await postback(s, 'clk_missing', 'install', at(60))).outcome).toBe('orphan');
    expect((await postback(s, clickId, 'tutorial_done', at(60))).outcome).toBe('unknown_event');
    expect((await handlePostback(db, { advertiserKey: other.postbackKey, query: { click_id: clickId, event: 'install' }, url: '/', ip: null, now: at(60) })).outcome).toBe('orphan');
    expect((await handlePostback(db, { advertiserKey: 'nope', query: { click_id: clickId, event: 'install' }, url: '/', ip: null })).httpStatus).toBe(403);
  });

  it('requires a valid signature when the advertiser has a postback secret', async () => {
    const s = await setup({ advertiserPostbackSecret: 'adv-secret' });
    const clickId = await click(s);
    expect((await postback(s, clickId, 'install', at(60))).outcome).toBe('invalid_signature');
    expect((await postback(s, clickId, 'install', at(60), { sig: sign('adv-secret', [clickId, 'install']) })).outcome).toBe('approved');
  });
});

describe('reversals (chargeback)', () => {
  it('refunds the advertiser, debits the publisher and queues a status=2 postback', async () => {
    const s = await setup();
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));

    const result = await reverseConversion(db, { advertiserKey: s.postbackKey, clickId, eventName: 'install', reason: 'protect360', now: at(DAY) });
    expect(result.ok).toBe(true);
    expect(await balanceOf(db, 'advertiser_balance', s.advertiserId)).toBe(1_000_000_000n);
    expect(await balanceOf(db, 'publisher_payable', s.publisherId)).toBe(0n);
    expect(await balanceOf(db, 'kiqro_revenue', null)).toBe(0n);

    const reversal = (await db.select().from(publisherPostbacks)).find((p) => p.kind === 'reversal');
    expect(new URL(reversal!.url).searchParams.get('status')).toBe('2');
    const [conversion] = await db.select().from(conversions);
    expect(conversion!.status).toBe('reversed');

    const again = await reverseConversion(db, { advertiserKey: s.postbackKey, clickId, eventName: 'install', reason: 'again', now: at(DAY) });
    expect(again).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('refuses reversals after the advertiser reversal window', async () => {
    const s = await setup();
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));
    const late = await reverseConversion(db, { advertiserKey: s.postbackKey, clickId, eventName: 'install', reason: 'late', now: at(31 * DAY) });
    expect(late).toEqual({ ok: false, reason: 'outside_reversal_window' });
  });

  it('accepts MMP rejection calls on the reversal endpoint', async () => {
    const s = await setup();
    const now = new Date();
    const clickId = await click(s, { now });
    await postback(s, clickId, 'install', new Date(now.getTime() + 60_000));
    const res = await server(db).inject({ url: `/v1/mmp/${s.postbackKey}/reversal?click_id=${clickId}&event=install&reason=protect360` });
    expect(res.statusCode).toBe(200);
    expect(res.json().outcome).toBe('reversed');
  });
});

describe('publisher postback delivery', () => {
  it('marks successful deliveries as sent and backs off failures until they fail permanently', async () => {
    const s = await setup();
    const first = await click(s);
    await postback(s, first, 'install', at(60));
    const second = await click(s, { user: 'user-2' });
    await postback(s, second, 'install', at(60));

    const okUrl = (await db.select().from(publisherPostbacks))[0]!.url;
    const fetcher = async (url: string) => ({ ok: url === okUrl, status: url === okUrl ? 200 : 500 });

    expect(await deliverDuePostbacks(db, fetcher, at(120))).toBe(2);
    const rows = await db.select().from(publisherPostbacks);
    expect(rows.find((r) => r.url === okUrl)!.status).toBe('sent');
    const failing = rows.find((r) => r.url !== okUrl)!;
    expect(failing).toMatchObject({ status: 'pending', attempts: 1, lastError: 'HTTP 500' });
    expect(await deliverDuePostbacks(db, fetcher, at(121))).toBe(0); // backing off

    let now = at(120);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      now = new Date(now.getTime() + 7 * 3_600_000);
      await deliverDuePostbacks(db, fetcher, now);
    }
    const [final] = await db.select().from(publisherPostbacks).where(eq(publisherPostbacks.id, failing.id));
    expect(final).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });
});

describe('ledger', () => {
  it('refuses unbalanced transactions', async () => {
    const a = await getAccountId(db, 'kiqro_revenue', null);
    const b = await getAccountId(db, 'external_cash', null);
    await expect(postTransaction(db, { type: 'test', entries: [{ accountId: a, amount: 5n }, { accountId: b, amount: -4n }] })).rejects.toThrow('Unbalanced');
  });
});

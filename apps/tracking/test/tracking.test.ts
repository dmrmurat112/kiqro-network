import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { postTransaction, getAccountId, schema, type Db } from '@kiqro/db';
import {
  createDemoSetup,
  campaignRoas,
  decideClaim,
  listOffers,
  deliverDueWebhooks,
  isAllowedWebhookUrl,
  verifyWebhookSignature,
  fileClaim,
  deliverDuePostbacks,
  handleClick,
  handlePostback,
  MAX_ATTEMPTS,
  reverseConversion,
  type DemoOptions,
  type DemoSetup,
} from '@kiqro/network';
import { KiqroDirect } from '@kiqro/direct-sdk';
import { balanceOf, resetDb, server, setupDb, TRACKING_BASE } from './helpers.ts';
import { buildServer } from '../src/server.ts';
import { createAdminUser } from '@kiqro/network/admin';
import { advertiserLogin, createAdvertiserUser, createApiKey, createWebhookEndpoint, getAdvertiserSession, listApiKeys, revokeApiKey, setPasswordWithToken } from '@kiqro/network/advertiser';

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

  it('refuses requests that bypass Cloudflare when an origin secret is set, and uses CF-Connecting-IP', async () => {
    const s = await setup();
    const app = buildServer({ db, trackingBaseUrl: 'https://t.test', originSecret: 'origin-secret' });
    const url = `/c/${s.campaignId}?app_key=${s.appKey}&uid=u1&sig=${sign(s.placementSecret, [s.campaignId, 'u1'])}`;
    expect((await app.inject({ url, headers: { 'cf-ipcountry': 'TR' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
    const ok = await app.inject({ url, headers: { 'cf-ipcountry': 'TR', 'x-origin-auth': 'origin-secret', 'cf-connecting-ip': '203.0.113.50' } });
    expect(ok.statusCode).toBe(302);
    const [stored] = await db.select().from(schema.clicks);
    expect(stored!.ip).toBe('203.0.113.50');
  });

  it('shows browsers a readable page in their language when a click is refused', async () => {
    const s = await setup();
    const url = `/c/${s.campaignId}?app_key=${s.appKey}&uid=u1&sig=${sign(s.placementSecret, [s.campaignId, 'u1'])}`;
    const res = await server(db).inject({ url, headers: { 'cf-ipcountry': 'US', accept: 'text/html', 'accept-language': 'tr-TR,tr;q=0.9' } });
    expect(res.statusCode).toBe(409);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Bu teklif ülkenizde geçerli değil.');
  });

  it('reports progress per step and keeps started offers listed', async () => {
    const s = await setup({ totalBudgetUsd: '0.40' });
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));
    const res = await server(db).inject({
      url: `/v1/offers?app_key=${s.appKey}&user_id=user-1&country=TR&sig=${sign(s.placementSecret, [s.appKey, 'user-1'])}`,
    });
    const [offer] = res.json().offers;
    // The budget is spent, so new users no longer see it — but this user started it.
    expect(offer).toMatchObject({ offerId: s.campaignId, started: true, completed: false });
    expect(offer.tasks.map((t: { state: string }) => t.state)).toEqual(['credited', 'open', 'open']);
    const other = await server(db).inject({
      url: `/v1/offers?app_key=${s.appKey}&user_id=user-2&country=TR&sig=${sign(s.placementSecret, [s.appKey, 'user-2'])}`,
    });
    expect(other.json().offers).toEqual([]);
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

  it('lets advertisers on credit terms spend below zero, but not past the limit or with an overdue invoice', async () => {
    const s = await setup({ topUpUsd: '0.10' });
    await db.update(schema.organizations).set({ creditLimit: 1_000_000n }).where(eq(schema.organizations.id, s.advertiserId)); // $1 credit line
    const first = await click(s);
    expect((await postback(s, first, 'install', at(60))).outcome).toBe('approved');
    expect(await balanceOf(db, 'advertiser_balance', s.advertiserId)).toBeLessThan(0n);

    // An overdue invoice suspends the credit line: no new clicks, conversions are held.
    await db.insert(schema.invoices).values({
      id: 'inv_test',
      number: 'KI-2026-99999',
      orgId: s.advertiserId,
      billingEntity: 'kiqro_inc',
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-02-01T00:00:00Z'),
      periodSpend: 0n,
      amount: 1n,
      issuedAt: new Date('2026-02-01T00:00:00Z'),
      dueAt: new Date('2026-03-01T00:00:00Z'),
    });
    const user = 'user-2';
    const blocked = await handleClick(db, {
      campaignId: s.campaignId,
      appKey: s.appKey,
      publisherUserId: user,
      signature: sign(s.placementSecret, [s.campaignId, user]),
      country: 'TR',
      ip: '203.0.113.7',
      userAgent: 'test',
      query: {},
      now: T0,
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'advertiser_balance_empty' });
    expect(await postback(s, first, 'af_level_achieved_10', at(120))).toMatchObject({ outcome: 'held', reasons: ['insufficient_balance'] });
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

describe('missing-credit claims', () => {
  const claimBody = (s: DemoSetup, user: string, taskId: string, note = 'Reached level 10 yesterday') => ({
    app_key: s.appKey,
    user_id: user,
    offer_id: s.campaignId,
    task_id: taskId,
    note,
    sig: sign(s.placementSecret, [s.appKey, user, s.campaignId, taskId]),
  });

  async function taskIds(s: DemoSetup) {
    const tasks = await db.select().from(schema.campaignTasks).where(eq(schema.campaignTasks.campaignId, s.campaignId));
    return Object.fromEntries(tasks.map((t) => [t.mmpEventName, t.id]));
  }

  it('files a claim for a clicked offer, lets the advertiser approve it, and rewards the user once', async () => {
    const s = await setup();
    const tasks = await taskIds(s);
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));
    const app = server(db);

    // Offers expose task ids; form and JSON bodies both work; a second filing returns the same claim.
    const offers = await app.inject({ url: `/v1/offers?app_key=${s.appKey}&user_id=user-1&country=TR&sig=${sign(s.placementSecret, [s.appKey, 'user-1'])}` });
    expect(offers.json().offers[0].tasks[1].taskId).toBe(tasks.af_level_achieved_10);
    const filed = await app.inject({ method: 'POST', url: '/v1/claims', payload: new URLSearchParams(claimBody(s, 'user-1', tasks.af_level_achieved_10!)).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(filed.statusCode).toBe(200);
    const { claim_id: claimId } = filed.json();
    expect((await app.inject({ method: 'POST', url: '/v1/claims', payload: claimBody(s, 'user-1', tasks.af_level_achieved_10!) })).json().claim_id).toBe(claimId);

    // Refused: bad signature, no click, already rewarded.
    expect((await app.inject({ method: 'POST', url: '/v1/claims', payload: { ...claimBody(s, 'user-1', tasks.af_level_achieved_10!), sig: 'x' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/claims', payload: claimBody(s, 'never-clicked', tasks.install!) })).json()).toEqual({ error: 'no_click' });
    expect((await app.inject({ method: 'POST', url: '/v1/claims', payload: claimBody(s, 'user-1', tasks.install!) })).json()).toEqual({ error: 'already_rewarded' });

    const before = await balanceOf(db, 'advertiser_balance', s.advertiserId);
    expect(await decideClaim(db, claimId, { approve: true, note: '', orgId: 'org_someone_else' })).toEqual({ ok: false, reason: 'claim_not_found' });
    expect(await decideClaim(db, claimId, { approve: true, note: 'Confirmed in AppsFlyer raw data', orgId: s.advertiserId })).toEqual({ ok: true });
    expect(await decideClaim(db, claimId, { approve: true, note: '', orgId: s.advertiserId })).toEqual({ ok: false, reason: 'claim_not_open' });
    expect(before - (await balanceOf(db, 'advertiser_balance', s.advertiserId))).toBe(2_200_000n); // level-10 price
    const credited = await db.select().from(conversions).where(eq(conversions.taskId, tasks.af_level_achieved_10!));
    expect(credited).toMatchObject([{ status: 'approved', reasons: ['claim_approved'], publisherUserId: 'user-1' }]);
    expect(await db.select().from(publisherPostbacks).where(eq(publisherPostbacks.conversionId, credited[0]!.id))).toHaveLength(1);

    const list = await app.inject({ url: `/v1/claims?app_key=${s.appKey}&user_id=user-1&sig=${sign(s.placementSecret, [s.appKey, 'user-1'])}` });
    expect(list.json().claims).toMatchObject([{ claim_id: claimId, status: 'approved', task_id: tasks.af_level_achieved_10 }]);
  });

  it('turns a rejected postback into a billed conversion on approval, and needs a reason to reject', async () => {
    const s = await setup();
    const tasks = await taskIds(s);
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));
    // Level 10 reported after the 7-day limit: rejected, so the user claims it.
    expect((await postback(s, clickId, 'af_level_achieved_10', at(9 * DAY))).outcome).toBe('rejected');
    const filed = await fileClaim(db, { ...camel(claimBody(s, 'user-1', tasks.af_level_achieved_10!)), now: at(9 * DAY + 60) });
    if (!filed.ok) throw new Error(filed.reason);
    expect(await decideClaim(db, filed.claimId, { approve: false, note: '', orgId: s.advertiserId })).toEqual({ ok: false, reason: 'claim_note_required' });
    expect((await decideClaim(db, filed.claimId, { approve: true, note: 'Late MMP event, OK', orgId: s.advertiserId })).ok).toBe(true);
    const rows = await db.select().from(conversions).where(eq(conversions.taskId, tasks.af_level_achieved_10!));
    expect(rows).toMatchObject([{ status: 'approved', reasons: ['task_time_limit_exceeded', 'claim_approved'] }]);
  });
});

/** The API's snake_case claim body as fileClaim input. */
function camel(b: { app_key: string; user_id: string; offer_id: string; task_id: string; note: string; sig: string }) {
  return { appKey: b.app_key, publisherUserId: b.user_id, campaignId: b.offer_id, taskId: b.task_id, note: b.note, signature: b.sig };
}

describe('advertiser API and webhooks', () => {
  /** A team admin of the demo advertiser, signed in, plus an API key it created. */
  async function owner(s: DemoSetup) {
    const actor = await createAdminUser(db, { email: `ops${Math.random()}@kiqro.test`, name: 'Ops', role: 'operator', password: 'correct horse battery' });
    const staff = (await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, actor) }))!;
    await createAdvertiserUser(db, staff, s.advertiserId, { email: 'dev@studio.test', name: 'Dev Lead' }, { advertiseBaseUrl: 'https://advertise.test' });
    const mail = (await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.to, 'dev@studio.test')))[0]!;
    await setPasswordWithToken(db, /token=([\w-]+)/.exec(mail.text)![1]!, 'long enough password');
    const login = await advertiserLogin(db, { email: 'dev@studio.test', password: 'long enough password', ip: null });
    if (login.status !== 'ok') throw new Error(login.status);
    return (await getAdvertiserSession(db, login.token))!;
  }

  it('serves reports and actions to API keys, and refuses revoked or foreign keys', async () => {
    const s = await setup();
    const me = await owner(s);
    const created = await createApiKey(db, me, 'BI export', 'en');
    if (!created.ok) throw new Error('key');
    const app = server(db);
    const get = (url: string, key = created.key) => app.inject({ url, headers: { authorization: `Bearer ${key}` } });

    expect((await app.inject({ url: '/v1/advertiser/me' })).statusCode).toBe(401);
    expect((await get('/v1/advertiser/me')).json()).toMatchObject({ organization: { id: s.advertiserId }, balance_usd: '1000.00', spendable_usd: '1000.00' });
    expect((await get('/v1/advertiser/campaigns')).json().campaigns[0]).toMatchObject({ id: s.campaignId, status: 'active', steps: [{ event: 'install' }, {}, {}] });

    await postback(s, await click(s), 'install', at(60));
    const conv = (await get('/v1/advertiser/conversions?status=billed&limit=10')).json();
    expect(conv.conversions).toMatchObject([{ event: 'install', status: 'billed', price_usd: '0.40' }]);

    const paused = await app.inject({ method: 'POST', url: `/v1/advertiser/campaigns/${s.campaignId}/pause`, headers: { authorization: `Bearer ${created.key}` } });
    expect(paused.json()).toEqual({ id: s.campaignId, status: 'paused' });

    await revokeApiKey(db, me, (await listApiKeys(db, s.advertiserId))[0]!.id, 'en');
    expect((await get('/v1/advertiser/me')).statusCode).toBe(401);
    expect((await get('/v1/advertiser/me', 'kq_live_made_up')).statusCode).toBe(401);
  });

  it('sends signed events to subscribed endpoints and retries failures', async () => {
    const s = await setup();
    const me = await owner(s);
    expect(await createWebhookEndpoint(db, me, { url: 'http://10.0.0.5/hook', events: ['conversion.approved'] }, 'en')).toMatchObject({ ok: false });
    const endpoint = await createWebhookEndpoint(db, me, { url: 'https://hooks.studio.test/kiqro', events: ['conversion.approved', 'conversion.reversed'] }, 'en');
    if (!endpoint.ok) throw new Error('endpoint');

    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));
    await reverseConversion(db, { advertiserKey: s.postbackKey, clickId, eventName: 'install', reason: 'fraud', now: at(120) });

    const sent: { url: string; headers: Record<string, string>; body: string }[] = [];
    let fail = true;
    const fetcher = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      sent.push({ url, headers: init.headers, body: init.body });
      return { status: fail ? 500 : 200 };
    };
    expect(await deliverDueWebhooks(db, fetcher, at(130))).toBe(2);
    fail = false;
    expect(await deliverDueWebhooks(db, fetcher, at(130 + 3600))).toBe(2); // retried after the backoff

    const last = sent.slice(-2);
    expect(last.map((m) => JSON.parse(m.body).type)).toEqual(['conversion.approved', 'conversion.reversed']);
    expect(JSON.parse(last[1]!.body).data).toMatchObject({ click_id: clickId, event: 'install', status: 'reversed', reason: 'fraud', price_usd: '0.40' });
    expect(verifyWebhookSignature(last[0]!.body, last[0]!.headers['kiqro-signature']!, endpoint.secret, at(130 + 3600))).toBe(true);
    expect(await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.status, 'sent'))).toHaveLength(2);
  });

  it('only allows public https webhook URLs', () => {
    expect(isAllowedWebhookUrl('https://api.studio.com/hooks')).toBe(true);
    for (const bad of ['http://api.studio.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://192.168.1.4/x', 'https://[::1]/x', 'https://user:pw@api.studio.com', 'https://metadata.internal/']) {
      expect(isAllowedWebhookUrl(bad)).toBe(false);
    }
  });
});

describe('hosted offerwall', () => {
  it('renders the signed wall with a strict CSP, escapes content and files claims from its form', async () => {
    const s = await setup();
    await db.update(schema.campaigns).set({ description: { en: '<script>alert(1)</script>' } }).where(eq(schema.campaigns.id, s.campaignId));
    const app = server(db);
    const sig = sign(s.placementSecret, [s.appKey, 'user-1']);
    const wall = await app.inject({ url: `/wall?app_key=${s.appKey}&user_id=user-1&sig=${sig}&lang=tr`, headers: { 'cf-ipcountry': 'TR' } });
    expect(wall.statusCode).toBe(200);
    expect(wall.headers['content-security-policy']).toContain("default-src 'none'");
    expect(wall.body).toContain('Ödül kazan');
    expect(wall.body).not.toContain('<script>');
    // Cards open the offer's page, which carries the signed click link.
    expect(wall.body).toContain(`offer=${s.campaignId}`);
    const detail = await app.inject({ url: `/wall?app_key=${s.appKey}&user_id=user-1&sig=${sig}&lang=tr&offer=${s.campaignId}`, headers: { 'cf-ipcountry': 'TR' } });
    expect(detail.body).toContain(`/c/${s.campaignId}?app_key=${s.appKey}`);
    expect(detail.body).toContain('Görevler');
    expect(detail.body).toContain('&lt;script&gt;');
    expect(detail.body).not.toContain('<script>');
    expect((await app.inject({ url: `/wall?app_key=${s.appKey}&user_id=user-1&sig=bad` })).statusCode).toBe(403);

    // After a click the offer moves to "in progress" and its page offers the missing-reward form.
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60));
    const started = await app.inject({ url: `/wall?app_key=${s.appKey}&user_id=user-1&sig=${sig}&tab=started`, headers: { 'cf-ipcountry': 'TR' } });
    expect(started.body).toContain('1/');
    const startedPage = await app.inject({ url: `/wall?app_key=${s.appKey}&user_id=user-1&sig=${sig}&tab=started&offer=${s.campaignId}`, headers: { 'cf-ipcountry': 'TR' } });
    expect(startedPage.body).toContain('Report missing reward');
    const levelTask = (await db.select().from(schema.campaignTasks).where(eq(schema.campaignTasks.mmpEventName, 'af_level_achieved_10')))[0]!;
    const posted = await app.inject({
      method: 'POST',
      url: '/wall/claim',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ app_key: s.appKey, user_id: 'user-1', sig, offer_id: s.campaignId, task_id: levelTask.id, note: 'level 10 done' }).toString(),
    });
    expect(posted.statusCode).toBe(303);
    expect(posted.headers.location).toContain('claimed=1');
    expect(await db.select().from(schema.claims)).toMatchObject([{ publisherUserId: 'user-1', taskId: levelTask.id, userNote: 'level 10 done' }]);

    const forged = await app.inject({ method: 'POST', url: '/wall/claim', payload: { app_key: s.appKey, user_id: 'user-2', sig, offer_id: s.campaignId, task_id: levelTask.id } });
    expect(forged.headers.location).toContain('claimed=0');
  });

  it("uses the publisher's branding and the app's cover image", async () => {
    const s = await setup();
    const app = server(db);
    const sig = sign(s.placementSecret, [s.appKey, 'user-1']);
    const url = `/wall?app_key=${s.appKey}&user_id=user-1&sig=${sig}&theme=light`;
    const campaign = (await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, s.campaignId)))[0]!;
    await db.update(schema.products).set({ coverUrl: 'https://cdn.example.com/banner.jpg' }).where(eq(schema.products.id, campaign.productId));
    await db.update(schema.placements).set({ brandColor: '#e5466b', wallTitle: 'Görev <Merkezi>' }).where(eq(schema.placements.appKey, s.appKey));

    const wall = await app.inject({ url, headers: { 'cf-ipcountry': 'TR' } });
    expect(wall.body).toContain('--accent:#e5466b');
    expect(wall.body).toContain('class="light"');
    expect(wall.body).toContain('Görev &lt;Merkezi&gt;');
    expect(wall.body).toContain('src="https://cdn.example.com/banner.jpg"');

    // A colour that is not #rrggbb never reaches the stylesheet.
    await db.update(schema.placements).set({ brandColor: 'red;}body{display:none' }).where(eq(schema.placements.appKey, s.appKey));
    const fallback = await app.inject({ url, headers: { 'cf-ipcountry': 'TR' } });
    expect(fallback.body).toContain('--accent:#6c57f0');
    expect(fallback.body).not.toContain('display:none');
  });
});

describe('publisher SDK against the tracking service', () => {
  it('lists offers, verifies the reward postback and files a claim', async () => {
    const s = await setup();
    const app = server(db);
    // Route the SDK's fetch calls into the in-process server.
    const fetcher = (async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const res = await app.inject({ method: (init?.method ?? 'GET') as 'GET', url: url.pathname + url.search, payload: init?.body as string | undefined, headers: { ...(init?.headers as Record<string, string>), 'cf-ipcountry': 'TR' } });
      return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const kiqro = new KiqroDirect({ appKey: s.appKey, secret: s.placementSecret, baseUrl: TRACKING_BASE, fetch: fetcher });

    const offers = await kiqro.getOffers('user-1', { lang: 'tr', country: 'TR' });
    expect(offers[0]).toMatchObject({ offerId: s.campaignId, started: false });
    await expect(new KiqroDirect({ appKey: s.appKey, secret: 'wrong', baseUrl: TRACKING_BASE, fetch: fetcher }).getOffers('user-1')).rejects.toMatchObject({ status: 403, code: 'invalid_signature' });

    // The reward postback Kiqro would send is accepted by verifyPostback.
    await db
      .update(schema.placements)
      .set({ postbackUrl: 'https://pub.test/cb?user_id={user_id}&amount={amount}&transaction_id={transaction_id}&status={status}&signature={signature}&task={task_id}&name={task_name_tr}' })
      .where(eq(schema.placements.appKey, s.appKey));
    await postback(s, await click(s), 'install', at(60));
    const [outbox] = await db.select().from(publisherPostbacks);
    const sent = Object.fromEntries(new URL(outbox!.url).searchParams);
    expect(kiqro.verifyPostback(sent)).toBe(true);
    // The step id matches the Offers API, so the publisher can label the reward in the user's language.
    expect(sent.task).toBe(offers[0]!.tasks[0]!.taskId);
    expect(sent.name).toBe(offers[0]!.tasks[0]!.name);

    const filed = await kiqro.fileClaim({ userId: 'user-1', offerId: s.campaignId, taskId: offers[0]!.tasks[1]!.taskId, note: 'done' });
    expect(filed.status).toBe('open');
    expect(await kiqro.listClaims('user-1')).toMatchObject([{ claim_id: filed.claim_id, status: 'open' }]);
  });
});

describe('ROAS and offer ranking', () => {
  it('records MMP revenue for clicked users and reports ROAS by days since the click', async () => {
    const s = await setup();
    const clickId = await click(s);
    await postback(s, clickId, 'install', at(60)); // $0.40 billed

    // A purchase that is also a billed step, a plain revenue event, a retry, a late one, and junk.
    expect((await postback(s, clickId, 'af_purchase', at(2 * DAY), { revenue_usd: '4.99', event_id: 'p1' })).outcome).toBe('approved');
    expect((await postback(s, clickId, 'af_ad_revenue', at(3 * DAY), { revenue: '0.25', currency: 'usd' })).outcome).toBe('revenue_recorded');
    await postback(s, clickId, 'af_ad_revenue', at(3 * DAY), { revenue_usd: '4.99', event_id: 'p1' }); // same MMP event id: ignored
    await postback(s, clickId, 'af_ad_revenue', at(20 * DAY), { revenue_usd: '10' });
    expect((await postback(s, clickId, 'af_ad_revenue', at(21 * DAY), { revenue: '9', currency: 'EUR' })).outcome).toBe('unknown_event');

    const [roas] = await campaignRoas(db, s.advertiserId);
    expect(roas).toMatchObject({ spend: 6_400_000n, revenueD7: 5_240_000n, revenueD30: 15_240_000n, revenue: 15_240_000n, payingUsers: 1 });
    expect(roas!.roasD7).toBeCloseTo(0.8187, 3);
    expect(roas!.roas).toBeCloseTo(2.3812, 3);
  });

  it('ranks offers by smoothed earnings per click', async () => {
    const weak = await setup();
    const strong = await setup();
    // "weak" gets many clicks and no conversions; "strong" converts most of its clicks.
    for (let i = 0; i < 40; i++) await click(weak, { user: `w${i}` });
    for (let i = 0; i < 10; i++) {
      const c = await click(strong, { user: `s${i}` });
      await postback(strong, c, 'install', at(60));
      await postback(strong, c, 'af_level_achieved_10', at(3600));
    }
    const res = await listOffers(db, { appKey: weak.appKey, publisherUserId: 'new-user', signature: sign(weak.placementSecret, [weak.appKey, 'new-user']), country: 'TR', lang: 'en', trackingBaseUrl: TRACKING_BASE, now: at(7200) });
    if (!res.ok) throw new Error(res.reason);
    expect(res.offers.map((o) => o.offerId)).toEqual([strong.campaignId, weak.campaignId]);
  });
});

describe('publisher tools', () => {
  const offersUrl = (s: DemoSetup, user: string, extra = '') => `/v1/offers?app_key=${s.appKey}&user_id=${user}&country=TR&sig=${sign(s.placementSecret, [s.appKey, user])}${extra}`;

  it('filters by platform and category and returns custom values and new macros in postbacks', async () => {
    const s = await setup();
    const app = server(db);
    expect((await app.inject({ url: offersUrl(s, 'u1', '&platform=ios') })).json().offers).toEqual([]);
    expect((await app.inject({ url: offersUrl(s, 'u1', '&category=finance') })).json().offers).toEqual([]);
    const [offer] = (await app.inject({ url: offersUrl(s, 'u1', '&platform=android,ios&custom_1=camp%2042&custom_3=v2') })).json().offers;
    expect(offer).toMatchObject({ category: 'other', instructions: '', screenshots: [] });
    // Custom values ride on the click URL (unsigned) and come back in the postback.
    const clickUrl = new URL(offer.clickUrl);
    expect(clickUrl.searchParams.get('custom_1')).toBe('camp 42');
    await db
      .update(schema.placements)
      .set({ postbackUrl: 'https://pub.test/cb?u={user_id}&c1={custom_1}&c3={custom_3}&ip={ip}&key={app_key}&ct={click_time}&sb={is_sandbox}&sig={signature}' })
      .where(eq(schema.placements.appKey, s.appKey));
    const c = await handleClick(db, { campaignId: s.campaignId, appKey: s.appKey, publisherUserId: 'u1', signature: clickUrl.searchParams.get('sig')!, country: 'TR', ip: '203.0.113.9', userAgent: null, query: Object.fromEntries(clickUrl.searchParams), now: T0 });
    if (!c.ok) throw new Error(c.reason);
    // The advertiser's tracking link never sees the publisher's custom values.
    expect(c.redirectUrl).not.toContain('camp');
    await postback(s, c.clickId, 'install', at(60));
    const sent = new URL((await db.select().from(publisherPostbacks))[0]!.url).searchParams;
    expect(Object.fromEntries(sent)).toMatchObject({ u: 'u1', c1: 'camp 42', c3: 'v2', ip: '203.0.113.9', key: s.appKey, ct: String(T0.getTime() / 1000), sb: '0' });
  });

  it('bans users from offers and clicks, and serves signed daily stats', async () => {
    const s = await setup();
    const app = server(db);
    const post = (path: string, body: Record<string, string>) => app.inject({ method: 'POST', url: path, payload: body });
    // The offerwall signature (app_key|user_id) must not authorize bans.
    expect((await post('/v1/publisher/unbans', { app_key: s.appKey, user_id: 'u9', sig: sign(s.placementSecret, [s.appKey, 'u9']) })).statusCode).toBe(403);
    expect((await post('/v1/publisher/bans', { app_key: s.appKey, user_id: 'u9', reason: 'fraud', sig: sign(s.placementSecret, ['ban', s.appKey, 'u9']) })).json()).toEqual({ user_id: 'u9', banned: true });
    expect((await app.inject({ url: offersUrl(s, 'u9') })).json().offers).toEqual([]);
    const refused = await handleClick(db, { campaignId: s.campaignId, appKey: s.appKey, publisherUserId: 'u9', signature: sign(s.placementSecret, [s.campaignId, 'u9']), country: 'TR', ip: null, userAgent: null, query: {}, now: T0 });
    expect(refused).toMatchObject({ ok: false, status: 403, reason: 'user_banned' });
    await post('/v1/publisher/unbans', { app_key: s.appKey, user_id: 'u9', sig: sign(s.placementSecret, ['unban', s.appKey, 'u9']) });
    expect((await app.inject({ url: offersUrl(s, 'u9') })).json().offers).toHaveLength(1);

    await postback(s, await click(s), 'install', at(60));
    const day = T0.toISOString().slice(0, 10);
    const stats = (from: string, to: string, sig = sign(s.placementSecret, ['stats', s.appKey, from, to])) => app.inject({ url: `/v1/publisher/stats?app_key=${s.appKey}&from=${from}&to=${to}&sig=${sig}` });
    expect((await stats(day, day, 'bad')).statusCode).toBe(403);
    expect((await stats('2026-01-01', '2026-12-31')).statusCode).toBe(400);
    expect((await stats(day, day)).json().days).toEqual([{ date: day, clicks: 1, users: 1, rewards: 1, reversals: 0, earnings_usd: '0.28', points: '280' }]);
  });

  it('multiplies rewards of offers clicked during a currency sale', async () => {
    const s = await setup();
    const placement = (await db.query.placements.findFirst({ where: eq(schema.placements.appKey, s.appKey) }))!;
    await db.insert(schema.currencySales).values({ id: 'sal_test', placementId: placement.id, multiplierBps: 15_000, startsAt: at(-3600), endsAt: at(3600) });
    const list = await listOffers(db, { appKey: s.appKey, publisherUserId: 'u1', signature: sign(s.placementSecret, [s.appKey, 'u1']), country: 'TR', lang: 'en', trackingBaseUrl: TRACKING_BASE, now: at(0) });
    if (!list.ok) throw new Error(list.reason);
    expect(list.placement.sale).toEqual({ multiplier: 1.5, endsAt: at(3600).toISOString() });
    expect(list.offers[0]!.tasks[0]!.rewardPoints).toBe('420'); // 280 × 1.5
    // Clicked during the sale, completed after it: still multiplied.
    const clickId = await click(s, { now: at(0) });
    await postback(s, clickId, 'install', at(2 * 3600));
    expect((await db.select().from(conversions))[0]!.userRewardPoints).toBe(420n);
    // A click after the sale earns the normal rate.
    const later = await click(s, { user: 'user-2', now: at(4 * 3600) });
    await postback(s, later, 'install', at(5 * 3600));
    expect((await db.select().from(conversions).where(eq(conversions.clickId, later)))[0]!.userRewardPoints).toBe(280n);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import {
  createDemoSetup,
  defaultFraudConfig,
  handleClick,
  handlePostback,
  proxycheckIntel,
  listOffers,
  staticIpIntel,
  type DemoSetup,
  type FraudContext,
} from '../src/index.ts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

const T0 = new Date('2026-11-03T09:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

const intel = staticIpIntel({
  '10.0.0.1': { vpn: true },
  '10.0.0.2': { datacenter: true },
  '10.0.0.3': { score: 95 },
  '10.0.0.4': { score: 60 },
  '10.0.0.5': { country: 'US' },
});
const fraud: FraudContext = { intel, config: defaultFraudConfig };

function click(s: DemoSetup, opts: { user?: string; ip?: string; risk?: string; now?: Date } = {}) {
  const user = opts.user ?? 'u1';
  const parts = opts.risk === undefined ? [s.campaignId, user] : [s.campaignId, user, opts.risk];
  return handleClick(db, {
    campaignId: s.campaignId,
    appKey: s.appKey,
    publisherUserId: user,
    signature: sign(s.placementSecret, parts),
    country: 'TR',
    ip: opts.ip ?? '198.51.100.20',
    userAgent: null,
    query: {},
    publisherRisk: opts.risk,
    fraud,
    now: opts.now ?? T0,
  });
}

async function install(s: DemoSetup, clickId: string, now = at(60)) {
  return handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: clickId, event: 'install' }, url: '/', ip: null, fraud, now });
}

describe('click screening', () => {
  it('blocks anonymizers, datacenters, high-risk IPs and country mismatches', async () => {
    const s = await createDemoSetup(db);
    expect(await click(s, { ip: '10.0.0.1' })).toMatchObject({ ok: false, reason: 'anonymizer', status: 403 });
    expect(await click(s, { ip: '10.0.0.2' })).toMatchObject({ ok: false, reason: 'datacenter_ip' });
    expect(await click(s, { ip: '10.0.0.3' })).toMatchObject({ ok: false, reason: 'ip_high_risk' });
    expect(await click(s, { ip: '10.0.0.5' })).toMatchObject({ ok: false, reason: 'ip_country_mismatch' });
    expect(await click(s, { ip: '10.0.0.4' })).toMatchObject({ ok: true });
  });

  it('limits clicks per IP per hour', async () => {
    const s = await createDemoSetup(db);
    const limited: FraudContext = { intel, config: { ...defaultFraudConfig, maxClicksPerIpPerHour: 2 } };
    const go = (user: string) =>
      handleClick(db, {
        campaignId: s.campaignId, appKey: s.appKey, publisherUserId: user, signature: sign(s.placementSecret, [s.campaignId, user]),
        country: 'TR', ip: '198.51.100.30', userAgent: null, query: {}, fraud: limited, now: T0,
      });
    expect((await go('a')).ok).toBe(true);
    expect((await go('b')).ok).toBe(true);
    expect(await go('c')).toMatchObject({ ok: false, status: 429, reason: 'ip_click_velocity' });
  });

  it('signs the publisher risk score and blocks very risky users', async () => {
    const s = await createDemoSetup(db);
    const tampered = await handleClick(db, {
      campaignId: s.campaignId, appKey: s.appKey, publisherUserId: 'u1', signature: sign(s.placementSecret, [s.campaignId, 'u1', '10']),
      country: 'TR', ip: null, userAgent: null, query: {}, publisherRisk: '5', fraud, now: T0,
    });
    expect(tampered).toMatchObject({ ok: false, reason: 'invalid_signature' });
    expect(await click(s, { risk: '95' })).toMatchObject({ ok: false, reason: 'publisher_user_risk' });
    expect(await click(s, { risk: 'abc' })).toMatchObject({ ok: false, reason: 'invalid_risk' });
    expect((await click(s, { risk: '10' })).ok).toBe(true);
  });

  it('carries the signed risk score from the Offers API into click URLs', async () => {
    const s = await createDemoSetup(db);
    const result = await listOffers(db, {
      appKey: s.appKey, publisherUserId: 'u1', signature: sign(s.placementSecret, [s.appKey, 'u1', '40']), publisherRisk: '40',
      country: 'TR', lang: 'en', trackingBaseUrl: 'https://t.test', now: T0,
    });
    if (!result.ok) throw new Error(result.reason);
    const url = new URL(result.offers[0]!.clickUrl);
    expect(url.searchParams.get('risk')).toBe('40');
    expect(url.searchParams.get('sig')).toBe(sign(s.placementSecret, [s.campaignId, 'u1', '40']));
  });
});

describe('conversion holds', () => {
  it('holds conversions from risky IPs and risky publisher users', async () => {
    const s = await createDemoSetup(db);
    const risky = await click(s, { ip: '10.0.0.4' });
    if (!risky.ok) throw new Error(risky.reason);
    expect(await install(s, risky.clickId)).toMatchObject({ outcome: 'held', reasons: ['ip_risky'] });

    const user = await click(s, { user: 'u2', risk: '75' });
    if (!user.ok) throw new Error(user.reason);
    expect(await install(s, user.clickId)).toMatchObject({ outcome: 'held', reasons: ['publisher_user_risk'] });
  });

  it('holds installs once one IP has produced installs for several users (device farm)', async () => {
    const s = await createDemoSetup(db);
    const outcomes = [];
    for (const user of ['a', 'b', 'c', 'd']) {
      const c = await click(s, { user, ip: '198.51.100.77' });
      if (!c.ok) throw new Error(c.reason);
      outcomes.push((await install(s, c.clickId)).outcome);
    }
    expect(outcomes).toEqual(['approved', 'approved', 'approved', 'held']);
    const held = await db.query.conversions.findFirst({ where: eq(schema.conversions.status, 'held') });
    expect(held!.reasons).toEqual(['ip_install_cluster']);
  });

  it('holds when one user converts too fast', async () => {
    const s = await createDemoSetup(db);
    const strict: FraudContext = { intel, config: { ...defaultFraudConfig, maxConversionsPerUserPerHour: 1 } };
    const c = await click(s);
    if (!c.ok) throw new Error(c.reason);
    await handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: c.clickId, event: 'install' }, url: '/', ip: null, fraud: strict, now: at(60) });
    const level = await handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: c.clickId, event: 'af_level_achieved_10' }, url: '/', ip: null, fraud: strict, now: at(600) });
    expect(level).toMatchObject({ outcome: 'held', reasons: ['user_velocity'] });
  });
});

describe('proxycheck.io client', () => {
  // Shaped like the v3 OpenAPI example for a VPN address.
  const vpnResult = {
    risk: 50,
    detections: { anonymous: true, proxy: false, vpn: true, tor: false, hosting: true, scraper: false, compromised: false, confidence: 95 },
    location: { isocode: 'DE', country: 'Germany' },
    network: { type: 'Hosting' },
  };

  it('maps the v3 response, caches lookups and fails open', async () => {
    const urls: string[] = [];
    const fetcher = async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ status: 'ok', '37.60.48.2': vpnResult }) };
    };
    const client = proxycheckIntel('secret-key', { fetcher });
    expect(await client.lookup('37.60.48.2')).toEqual({ source: 'proxycheck', country: 'DE', vpn: true, proxy: false, tor: false, datacenter: true, score: 50 });
    await client.lookup('37.60.48.2');
    expect(urls).toEqual(['https://proxycheck.io/v3/37.60.48.2?key=secret-key&p=0']);

    const failing = proxycheckIntel('key', { fetcher: async () => { throw new Error('timeout'); } });
    expect(await failing.lookup('1.2.3.4')).toBeNull();
  });

  it('fails open without caching when the plan is exhausted, and logs why', async () => {
    const warnings: string[] = [];
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { ok: false, status: 429, json: async () => ({ status: 'denied', message: 'Queries exhausted.' }) };
    };
    const client = proxycheckIntel('key', { fetcher, warn: (m) => warnings.push(m) });
    expect(await client.lookup('1.2.3.4')).toBeNull();
    expect(await client.lookup('1.2.3.4')).toBeNull();
    expect(calls).toBe(2);
    expect(warnings).toEqual(['proxycheck.io: denied Queries exhausted.']);

    // A warning status (near the limit) still carries the result.
    const near = proxycheckIntel('key', {
      fetcher: async () => ({ ok: true, status: 200, json: async () => ({ status: 'warning', message: 'Within 10% of your limit.', '5.6.7.8': { risk: 0, detections: {}, location: { isocode: 'tr' } } }) }),
      warn: (m) => warnings.push(m),
    });
    expect(await near.lookup('5.6.7.8')).toMatchObject({ country: 'TR', vpn: false, datacenter: false, score: 0 });
    expect(warnings).toContain('proxycheck.io: Within 10% of your limit.');
  });
});

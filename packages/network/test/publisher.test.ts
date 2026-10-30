import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createDemoSetup, handleClick, handlePostback, type DemoSetup } from '../src/index.ts';
import { createAdminUser } from '../src/admin/index.ts';
import { advertiserLogin, createAdvertiserUser, getAdvertiserSession, inviteTeamMember, setPasswordWithToken, type AdvertiserSession } from '../src/advertiser/index.ts';
import { publisherConversions, publisherOverview, publisherPlacements, sendTestPostback, updatePlacementSettings } from '../src/publisher/index.ts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

const LINKS = { advertiseBaseUrl: 'https://advertise.test' };

async function signIn(email: string): Promise<AdvertiserSession> {
  const mail = (await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.to, email)))[0]!;
  await setPasswordWithToken(db, /token=([\w-]+)/.exec(mail.text)![1]!, 'long enough password');
  const login = await advertiserLogin(db, { email, password: 'long enough password', ip: null });
  if (login.status !== 'ok') throw new Error(login.status);
  return (await getAdvertiserSession(db, login.token))!;
}

/** A publisher panel user for the demo setup's publisher. */
async function publisherUser(s: DemoSetup): Promise<AdvertiserSession> {
  const id = await createAdminUser(db, { email: `ops${Math.random()}@kiqro.test`, name: 'Ops', role: 'operator', password: 'correct horse battery' });
  const staff = (await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, id) }))!;
  await createAdvertiserUser(db, staff, s.publisherId, { email: 'pub@app.test', name: 'Pub Dev' }, LINKS);
  return signIn('pub@app.test');
}

describe('publisher panel', () => {
  it('shows earnings and rewards of the publisher’s own placements', async () => {
    const s = await createDemoSetup(db);
    const me = await publisherUser(s);
    expect(me.org.type).toBe('publisher');
    const now = new Date();
    const c = await handleClick(db, { campaignId: s.campaignId, appKey: s.appKey, publisherUserId: 'u1', signature: sign(s.placementSecret, [s.campaignId, 'u1']), country: 'TR', ip: null, userAgent: null, query: {}, now });
    if (!c.ok) throw new Error(c.reason);
    await handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: c.clickId, event: 'install' }, url: '/', ip: null, now: new Date(now.getTime() + 60_000) });

    const o = await publisherOverview(db, s.publisherId, 7, new Date(now.getTime() + 120_000));
    expect(o).toMatchObject({ earnings: 280_000n, payable: 280_000n, conversions: 1, clicks: 1 }); // 70% of $0.40
    expect(await publisherConversions(db, s.publisherId)).toMatchObject([{ publisherUserId: 'u1', status: 'approved', payout: 280_000n }]);
    expect(await publisherConversions(db, s.advertiserId)).toEqual([]);
  });

  it('lets publisher admins set currency, rate and postback URL, but not the revenue share', async () => {
    const s = await createDemoSetup(db);
    const me = await publisherUser(s);
    const [placement] = await publisherPlacements(db, s.publisherId);
    expect(await updatePlacementSettings(db, me, placement!.id, { currencyName: 'Coins', pointsPerUsd: '500', postbackUrl: 'http://pub.test/cb' }, 'en')).toMatchObject({ ok: false, issues: [{ path: 'postbackUrl' }] });
    expect(await updatePlacementSettings(db, me, placement!.id, { currencyName: 'Coins', pointsPerUsd: '500', postbackUrl: 'https://pub.test/cb?u={user_id}&a={amount}&tx={transaction_id}&s={status}&sig={signature}' }, 'en')).toEqual({ ok: true });
    const after = (await db.query.placements.findFirst({ where: eq(schema.placements.id, placement!.id) }))!;
    expect(after).toMatchObject({ currencyName: 'Coins', pointsPerUsd: '500.000000', revshareBps: placement!.revshareBps, brandColor: null });

    // Offerwall branding: #rrggbb colour and an https logo only.
    const base = { currencyName: 'Coins', pointsPerUsd: '500', postbackUrl: after.postbackUrl! };
    expect(await updatePlacementSettings(db, me, placement!.id, { ...base, brandColor: 'red' }, 'en')).toMatchObject({ ok: false, issues: [{ path: 'brandColor' }] });
    expect(await updatePlacementSettings(db, me, placement!.id, { ...base, logoUrl: 'http://pub.test/logo.png' }, 'en')).toMatchObject({ ok: false, issues: [{ path: 'logoUrl' }] });
    expect(await updatePlacementSettings(db, me, placement!.id, { ...base, brandColor: '#E5466B', logoUrl: 'https://pub.test/logo.png', wallTitle: 'Görevler' }, 'en')).toEqual({ ok: true });
    expect(await db.query.placements.findFirst({ where: eq(schema.placements.id, placement!.id) })).toMatchObject({ brandColor: '#e5466b', logoUrl: 'https://pub.test/logo.png', wallTitle: 'Görevler' });

    // Members cannot change settings; other organizations cannot touch the placement.
    await inviteTeamMember(db, me, { email: 'member@app.test', name: 'Member', role: 'member' }, LINKS, 'en');
    expect((await updatePlacementSettings(db, await signIn('member@app.test'), placement!.id, { currencyName: 'X', pointsPerUsd: '1', postbackUrl: '' }, 'en')).ok).toBe(false);

    // The test postback is signed like real ones.
    const urls: string[] = [];
    const r = await sendTestPostback(db, me, placement!.id, async (url) => (urls.push(url), { status: 204 }));
    expect(r).toMatchObject({ ok: true, status: 204 });
    const q = new URL(urls[0]!).searchParams;
    expect(q.get('sig')).toBe(sign(after.secret, [q.get('u')!, q.get('a')!, q.get('tx')!, q.get('s')!]));
  });
});

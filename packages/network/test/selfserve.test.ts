import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { approveCampaign, createAdminUser, createAdvertiser, returnCampaign, type AdminUser, type CampaignInput } from '../src/admin/index.ts';
import {
  advertiserCampaignForm,
  advertiserCreateProduct,
  advertiserDeleteProduct,
  advertiserUpdateProduct,
  advertiserSaveCampaign,
  advertiserSetPaused,
  createAdvertiserUser,
  getAdvertiserSession,
  advertiserLogin,
  setPasswordWithToken,
  submitCampaignForReview,
  type AdvertiserSession,
} from '../src/advertiser/index.ts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

const LINKS = { advertiseBaseUrl: 'https://advertise.test' };
const NOTIFY = { to: 'review@kiqro.test', adminBaseUrl: 'https://admin.test' };

async function staff(): Promise<AdminUser> {
  const id = await createAdminUser(db, { email: `ops${Math.random()}@kiqro.test`, name: 'Ops', role: 'operator', password: 'correct horse battery' });
  return (await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, id) }))!;
}

/** A signed-in advertiser user of a fresh advertiser organization. */
async function advertiser(actor: AdminUser, email: string): Promise<AdvertiserSession> {
  const orgId = await createAdvertiser(db, actor, { name: `Studio ${email}`, country: 'FI', billingEntity: 'kiqro_inc', invoiceCurrency: 'EUR', reversalWindowDays: 30, requireSignedPostbacks: undefined });
  await createAdvertiserUser(db, actor, orgId, { email, name: 'UA Lead' }, LINKS);
  const mail = (await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.to, email)))[0]!;
  await setPasswordWithToken(db, /token=([\w-]+)/.exec(mail.text)![1]!, 'long enough password');
  const login = await advertiserLogin(db, { email, password: 'long enough password', ip: null });
  if (login.status !== 'ok') throw new Error(login.status);
  return (await getAdvertiserSession(db, login.token))!;
}

const draft = (productId: string, overrides: Partial<CampaignInput> = {}): CampaignInput => ({
  productId,
  name: 'Self-serve launch',
  trackingUrl: 'https://app.appsflyer.com/fi.studio.game?pid=kiqro_int&clickid={click_id}',
  countries: ['FI', 'SE'],
  totalBudgetUsd: '2000',
  dailyBudgetUsd: '',
  startAt: '',
  endAt: '',
  attributionWindowDays: 7,
  ctitMinSeconds: 10,
  titleEn: 'Aurora Quest',
  titleTr: '',
  descriptionEn: '',
  descriptionTr: '',
  tasks: [
    { event: 'install', timeLimitDays: 1, nameEn: 'Install and open', nameTr: '', prices: [{ country: '*', priceUsd: '0.80' }] },
    { event: 'af_level_achieved_10', timeLimitDays: 7, nameEn: 'Reach level 10', nameTr: '', prices: [{ country: '*', priceUsd: '3.50' }] },
  ],
  ...overrides,
});

const product = { platform: 'android', storeId: 'fi.studio.game', name: 'Aurora Quest', iconUrl: '', mmp: 'appsflyer' };

describe('self-serve campaigns', () => {
  it('runs draft → review → returned with a note → resubmitted → approved → paused/resumed', async () => {
    const ops = await staff();
    const me = await advertiser(ops, 'ua@studio.test');

    const p = await advertiserCreateProduct(db, me, product, 'en');
    if (!p.ok) throw new Error('product');
    const saved = await advertiserSaveCampaign(db, me, draft(p.id), 'en');
    if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
    const created = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, saved.id) });
    expect(created).toMatchObject({ status: 'draft', orgId: me.org.id, createdBy: me.user.id });

    expect((await submitCampaignForReview(db, me, saved.id, 'en', NOTIFY)).ok).toBe(true);
    const opsMail = (await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.to, 'review@kiqro.test')))[0]!;
    expect(opsMail.subject).toContain('İncelemeye gönderildi');
    // Locked while in review.
    expect(await advertiserSaveCampaign(db, me, draft(p.id, { name: 'Changed' }), 'en', saved.id)).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining('only draft campaigns') }] });

    await returnCampaign(db, ops, saved.id, 'Please use the af_level_achieved_10 event from your MMP and lower the level-10 limit to 5 days.', LINKS);
    const returned = (await advertiserCampaignForm(db, me, saved.id))!;
    expect(returned.campaign).toMatchObject({ status: 'draft', reviewNote: expect.stringContaining('5 days') });
    const returnMail = (await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.template, 'campaign_returned')))[0]!;
    expect(returnMail.text).toContain(`https://advertise.test/app/campaigns/${saved.id}/edit`);

    const fixed = draft(p.id, { tasks: draft(p.id).tasks.map((t, i) => (i === 1 ? { ...t, timeLimitDays: 5 } : t)) });
    expect((await advertiserSaveCampaign(db, me, fixed, 'en', saved.id)).ok).toBe(true);
    await submitCampaignForReview(db, me, saved.id, 'en', NOTIFY);
    await approveCampaign(db, ops, saved.id, LINKS);
    const live = (await advertiserCampaignForm(db, me, saved.id))!;
    expect(live.campaign).toMatchObject({ status: 'active', reviewNote: null });
    expect(live.form.tasks[1]!.timeLimitDays).toBe(5);
    expect(await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.template, 'campaign_approved'))).toHaveLength(1);

    expect((await advertiserSetPaused(db, me, saved.id, true, 'en')).ok).toBe(true);
    expect((await advertiserSetPaused(db, me, saved.id, true, 'en')).ok).toBe(false);
    expect((await advertiserSetPaused(db, me, saved.id, false, 'en')).ok).toBe(true);
    // A live campaign cannot be edited by the advertiser.
    expect((await advertiserSaveCampaign(db, me, fixed, 'en', saved.id)).ok).toBe(false);
  });

  it('localizes validation and enforces the minimum budget', async () => {
    const me = await advertiser(await staff(), 'v@studio.test');
    const p = await advertiserCreateProduct(db, me, product, 'tr');
    if (!p.ok) throw new Error('product');
    const bad = await advertiserSaveCampaign(db, me, draft(p.id, { trackingUrl: 'https://app.adjust.com/abc' }), 'en');
    expect(bad).toMatchObject({ ok: false, issues: [{ path: 'trackingUrl', message: 'the tracking link must contain the {click_id} macro' }] });
    const badTr = await advertiserSaveCampaign(db, me, draft(p.id, { trackingUrl: 'https://app.adjust.com/abc' }), 'tr');
    expect(badTr).toMatchObject({ ok: false, issues: [{ message: 'takip linkinde {click_id} makrosu olmalı' }] });
    expect(await advertiserSaveCampaign(db, me, draft(p.id, { totalBudgetUsd: '50' }), 'en')).toMatchObject({ ok: false, issues: [{ path: 'totalBudgetUsd', message: 'the total budget must be at least $100' }] });
  });

  it('edits and deletes apps, protecting those that campaigns rely on', async () => {
    const ops = await staff();
    const me = await advertiser(ops, 'apps@studio.test');
    const other = await advertiser(ops, 'other@studio.test');
    const p = await advertiserCreateProduct(db, me, product, 'en');
    if (!p.ok) throw new Error('product');
    expect(await advertiserCreateProduct(db, me, { ...product, name: 'Again' }, 'en')).toMatchObject({ ok: false, issues: [{ path: 'storeId', message: 'this app is already in your list' }] });

    // While unused, everything can change.
    expect((await advertiserUpdateProduct(db, me, p.id, { ...product, storeId: 'fi.studio.game2', name: 'Aurora 2', mmp: 'adjust' }, 'en')).ok).toBe(true);
    expect(await db.query.products.findFirst({ where: eq(schema.products.id, p.id) })).toMatchObject({ storeId: 'fi.studio.game2', name: 'Aurora 2', mmp: 'adjust' });
    expect((await advertiserUpdateProduct(db, other, p.id, product, 'en')).ok).toBe(false);
    expect((await advertiserDeleteProduct(db, other, p.id, 'en')).ok).toBe(false);

    // A submitted campaign locks platform and store ID, and any campaign blocks deletion.
    const c = await advertiserSaveCampaign(db, me, draft(p.id), 'en');
    if (!c.ok) throw new Error('campaign');
    expect(await advertiserDeleteProduct(db, me, p.id, 'tr')).toMatchObject({ ok: false, issues: [{ message: 'bu uygulamanın kampanyaları var; silinemez' }] });
    await submitCampaignForReview(db, me, c.id, 'en', NOTIFY);
    expect(await advertiserUpdateProduct(db, me, p.id, { ...product, storeId: 'fi.studio.other' }, 'en')).toMatchObject({ ok: false, issues: [{ path: 'storeId' }] });
    expect((await advertiserUpdateProduct(db, me, p.id, { ...product, storeId: 'fi.studio.game2', name: 'Aurora Quest HD' }, 'en')).ok).toBe(true);

    const spare = await advertiserCreateProduct(db, me, { ...product, storeId: 'fi.studio.spare' }, 'en');
    if (!spare.ok) throw new Error('spare');
    expect((await advertiserDeleteProduct(db, me, spare.id, 'en')).ok).toBe(true);
    expect(await db.query.products.findFirst({ where: eq(schema.products.id, spare.id) })).toBeUndefined();
  });

  it('keeps advertisers out of each other’s apps and campaigns', async () => {
    const ops = await staff();
    const a = await advertiser(ops, 'a@studio.test');
    const b = await advertiser(ops, 'b@studio.test');
    const pa = await advertiserCreateProduct(db, a, product, 'en');
    if (!pa.ok) throw new Error('product');
    const ca = await advertiserSaveCampaign(db, a, draft(pa.id), 'en');
    if (!ca.ok) throw new Error('campaign');

    expect(await advertiserSaveCampaign(db, b, draft(pa.id), 'en')).toMatchObject({ ok: false, issues: [{ path: 'productId' }] });
    expect(await advertiserCampaignForm(db, b, ca.id)).toBeNull();
    expect((await submitCampaignForReview(db, b, ca.id, 'en', NOTIFY)).ok).toBe(false);
    expect((await advertiserSetPaused(db, b, ca.id, true, 'en')).ok).toBe(false);
  });

  it('only approves or returns campaigns that are in review', async () => {
    const ops = await staff();
    const me = await advertiser(ops, 'r@studio.test');
    const p = await advertiserCreateProduct(db, me, product, 'en');
    if (!p.ok) throw new Error('product');
    const c = await advertiserSaveCampaign(db, me, draft(p.id), 'en');
    if (!c.ok) throw new Error('campaign');
    await expect(approveCampaign(db, ops, c.id, LINKS)).rejects.toThrow('incelemedeki');
    await submitCampaignForReview(db, me, c.id, 'en', NOTIFY);
    await expect(returnCampaign(db, ops, c.id, 'no', LINKS)).rejects.toThrow('yazın');
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { getAccountId, getBalance, schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createDemoSetup, handleClick, handlePostback } from '../src/index.ts';
import {
  AdminError,
  approveHeldConversion,
  createAdminUser,
  createAdvertiser,
  createCampaign,
  createPlacement,
  createProduct,
  createPublisher,
  dashboardStats,
  getCampaignForm,
  listPublisherPostbacks,
  listRawPostbacks,
  getSessionUser,
  listCampaigns,
  listConversions,
  listOrganizations,
  login,
  logout,
  recordTopUp,
  rejectHeldConversion,
  setCampaignStatus,
  updateCampaign,
  updatePlacement,
  type AdminUser,
  type CampaignInput,
} from '../src/admin/index.ts';

const { adminUsers, auditLog, conversions, placements, publisherPostbacks } = schema;

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

const PASSWORD = 'correct horse battery';

async function admin(role: AdminUser['role'] = 'admin'): Promise<AdminUser> {
  const id = await createAdminUser(db, { email: `${role}-${Math.random()}@kiqro.test`, name: role, role, password: PASSWORD });
  return (await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, id) }))!;
}

const advertiserForm = { name: 'Nordic Games', country: 'FI', billingEntity: 'kiqro_inc', invoiceCurrency: 'EUR', reversalWindowDays: 30, requireSignedPostbacks: 'on' } as const;

function campaignForm(productId: string, overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    productId,
    name: 'Launch',
    trackingUrl: 'https://app.adjust.com/abc?click_id={click_id}',
    countries: ['FI', 'DE'],
    totalBudgetUsd: '1000',
    dailyBudgetUsd: '',
    startAt: '',
    endAt: '',
    attributionWindowDays: 7,
    ctitMinSeconds: 10,
    titleEn: 'Nordic Quest',
    titleTr: '',
    descriptionEn: '',
    descriptionTr: '',
    tasks: [
      { event: 'install', timeLimitDays: 1, nameEn: 'Install', nameTr: 'Yükle', prices: [{ country: '*', priceUsd: '0.50' }] },
      { event: 'level_10', timeLimitDays: 7, nameEn: 'Level 10', nameTr: '', prices: [{ country: 'FI', priceUsd: '3' }, { country: 'DE', priceUsd: '2.5' }] },
    ],
    ...overrides,
  };
}

describe('admin auth', () => {
  it('logs in with the right password, resolves the session and logs out', async () => {
    const user = await admin();
    expect(await login(db, user.email, 'wrong password!!', null)).toBeNull();
    const token = await login(db, user.email.toUpperCase(), PASSWORD, '127.0.0.1');
    expect(token).toBeTruthy();
    expect((await getSessionUser(db, token!))?.id).toBe(user.id);
    expect(await getSessionUser(db, token!, new Date(Date.now() + 13 * 3_600_000))).toBeNull();
    await logout(db, token!);
    expect(await getSessionUser(db, token!)).toBeNull();
  });

  it('rejects disabled users and short passwords', async () => {
    const user = await admin();
    await db.update(adminUsers).set({ disabledAt: new Date() }).where(eq(adminUsers.id, user.id));
    expect(await login(db, user.email, PASSWORD, null)).toBeNull();
    await expect(createAdminUser(db, { email: 'x@kiqro.test', name: 'x', role: 'viewer', password: 'short' })).rejects.toThrow();
  });
});

describe('advertisers and top-ups', () => {
  it('creates an advertiser with postback credentials and records top-ups with an audit trail', async () => {
    const actor = await admin();
    const id = await createAdvertiser(db, actor, advertiserForm);
    const org = (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, id) }))!;
    expect(org.postbackKey).toMatch(/^adv_/);
    expect(org.postbackSecret).toBeTruthy();

    await recordTopUp(db, actor, id, { amountUsd: '250.75', memo: 'Stripe pi_123' });
    expect(await getBalance(db, await getAccountId(db, 'advertiser_balance', id))).toBe(250_750_000n);
    const actions = (await db.select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['advertiser.create', 'advertiser.topup']));

    const other = await createAdvertiser(db, actor, { ...advertiserForm, name: 'Empty Co' });
    const listed = await listOrganizations(db, 'advertiser');
    expect(listed.find((o) => o.id === id)!.balance).toBe(250_750_000n);
    expect(listed.find((o) => o.id === other)!.balance).toBe(0n);
  });

  it('enforces roles: operators cannot move money, finance cannot create campaigns', async () => {
    const owner = await admin();
    const id = await createAdvertiser(db, owner, advertiserForm);
    await expect(recordTopUp(db, await admin('operator'), id, { amountUsd: '10', memo: 'x123' })).rejects.toBeInstanceOf(AdminError);
    await expect(createAdvertiser(db, await admin('finance'), advertiserForm)).rejects.toBeInstanceOf(AdminError);
    await expect(createAdvertiser(db, await admin('viewer'), advertiserForm)).rejects.toBeInstanceOf(AdminError);
  });

  it('validates input with readable messages', async () => {
    const actor = await admin();
    await expect(createAdvertiser(db, actor, { ...advertiserForm, country: 'Finland' })).rejects.toThrow('iki harfli ülke kodu');
    const id = await createAdvertiser(db, actor, advertiserForm);
    await expect(recordTopUp(db, actor, id, { amountUsd: '-5', memo: 'refund' })).rejects.toThrow('geçerli bir tutar');
  });
});

describe('campaigns', () => {
  async function product(actor: AdminUser) {
    const orgId = await createAdvertiser(db, actor, advertiserForm);
    return createProduct(db, actor, orgId, { platform: 'android', storeId: 'fi.nordic.quest', name: 'Nordic Quest', iconUrl: '', mmp: 'adjust' });
  }

  it('creates a draft campaign with tasks and prices and round-trips it through the form', async () => {
    const actor = await admin();
    const productId = await product(actor);
    const id = await createCampaign(db, actor, campaignForm(productId));
    const loaded = (await getCampaignForm(db, id))!;
    expect(loaded.campaign.status).toBe('draft');
    expect(loaded.form.tasks).toHaveLength(2);
    expect(loaded.form.tasks[1]!.prices).toEqual([
      { country: 'DE', priceUsd: '2.50' },
      { country: 'FI', priceUsd: '3.00' },
    ]);
    // Saving the loaded form unchanged must not count as a task change.
    await updateCampaign(db, actor, id, loaded.form);
  });

  it('rejects tracking links without {click_id}, duplicate events and uncovered countries', async () => {
    const actor = await admin();
    const productId = await product(actor);
    await expect(createCampaign(db, actor, campaignForm(productId, { trackingUrl: 'https://app.adjust.com/abc' }))).rejects.toThrow('{click_id}');
    const tasks = campaignForm(productId).tasks;
    await expect(createCampaign(db, actor, campaignForm(productId, { tasks: [tasks[0]!, tasks[0]!] }))).rejects.toThrow('aynı MMP olayı');
    await expect(createCampaign(db, actor, campaignForm(productId, { countries: ['FI', 'DE', 'SE'], tasks: [tasks[1]!] }))).rejects.toThrow('SE');
  });

  it('allows only valid status transitions', async () => {
    const actor = await admin();
    const id = await createCampaign(db, actor, campaignForm(await product(actor)));
    await expect(setCampaignStatus(db, actor, id, 'paused')).rejects.toThrow('geçirilemez');
    await setCampaignStatus(db, actor, id, 'active');
    await setCampaignStatus(db, actor, id, 'paused');
  });

  it('locks tasks and prices once the campaign has clicks', async () => {
    const actor = await admin();
    const s = await createDemoSetup(db);
    await handleClick(db, {
      campaignId: s.campaignId, appKey: s.appKey, publisherUserId: 'u1', signature: sign(s.placementSecret, [s.campaignId, 'u1']),
      country: 'TR', ip: null, userAgent: null, query: {},
    });
    const loaded = (await getCampaignForm(db, s.campaignId))!;
    expect(loaded.hasClicks).toBe(true);
    await updateCampaign(db, actor, s.campaignId, { ...loaded.form, totalBudgetUsd: '9000' }); // budget changes are fine
    const repriced = { ...loaded.form, tasks: loaded.form.tasks.map((t) => ({ ...t, prices: [{ country: '*', priceUsd: '0.01' }] })) };
    await expect(updateCampaign(db, actor, s.campaignId, repriced)).rejects.toThrow('tıklama olduğu için');
  });
});

describe('publishers and placements', () => {
  it('creates placements with keys and logs revenue share changes', async () => {
    const actor = await admin();
    const publisherId = await createPublisher(db, actor, { name: 'Kiqro App', country: 'TR' });
    const form = { name: 'Kiqro Direct', currencyName: 'Puan', pointsPerUsd: '1000', revsharePercent: '70', postbackUrl: 'https://api.kiqro.com/cb?u={user_id}', status: 'active' } as const;
    const id = await createPlacement(db, actor, publisherId, form);
    const placement = (await db.query.placements.findFirst({ where: eq(placements.id, id) }))!;
    expect(placement.revshareBps).toBe(7000);
    expect(placement.appKey).toMatch(/^app_/);

    await updatePlacement(db, actor, id, { ...form, revsharePercent: '72.5' });
    expect((await db.query.placements.findFirst({ where: eq(placements.id, id) }))!.revshareBps).toBe(7250);
    const log = (await db.select().from(auditLog)).find((a) => a.action === 'placement.update')!;
    expect(log.details).toMatchObject({ before: { revshareBps: 7000 }, after: { revshareBps: 7250 } });

    await expect(updatePlacement(db, actor, id, { ...form, revsharePercent: '150' })).rejects.toThrow('%0 ile %100');
    await expect(updatePlacement(db, actor, id, { ...form, postbackUrl: 'http://evil.example' })).rejects.toThrow('https://');
  });
});

describe('held conversion review', () => {
  async function heldConversion() {
    const s = await createDemoSetup(db, { topUpUsd: '0.10' });
    const now = new Date();
    const click = await handleClick(db, {
      campaignId: s.campaignId, appKey: s.appKey, publisherUserId: 'u1', signature: sign(s.placementSecret, [s.campaignId, 'u1']),
      country: 'TR', ip: null, userAgent: null, query: {}, now,
    });
    if (!click.ok) throw new Error(click.reason);
    const result = await handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: click.clickId, event: 'install' }, url: '/', ip: null, now: new Date(now.getTime() + 60_000) });
    expect(result.outcome).toBe('held');
    return { s, conversionId: result.conversionId! };
  }

  it('approves a held conversion only once the balance covers it, then credits and queues the postback', async () => {
    const actor = await admin();
    const { s, conversionId } = await heldConversion();
    await expect(approveHeldConversion(db, actor, conversionId, 'checked with advertiser')).rejects.toThrow('bakiyesi');

    await recordTopUp(db, actor, s.advertiserId, { amountUsd: '10', memo: 'wire 42' });
    await approveHeldConversion(db, actor, conversionId, 'checked with advertiser');
    const conversion = (await db.query.conversions.findFirst({ where: eq(conversions.id, conversionId) }))!;
    expect(conversion.status).toBe('approved');
    expect(await getBalance(db, await getAccountId(db, 'publisher_payable', s.publisherId))).toBe(280_000n);
    expect(await db.select().from(publisherPostbacks)).toHaveLength(1);
    await expect(approveHeldConversion(db, actor, conversionId, 'again please')).rejects.toThrow('Yalnızca bekleyen');

    // Read models used by the panel pages.
    expect(await listConversions(db, { status: 'approved' })).toHaveLength(1);
    expect(await listConversions(db, { status: 'held' })).toHaveLength(0);
    const [listed] = await listCampaigns(db, { orgId: s.advertiserId });
    expect(listed!.spend).toBe(400_000n);
    const stats = await dashboardStats(db, 1);
    expect(stats).toMatchObject({ approved: 1, holdQueue: 0, spend: 400_000n, revenue: 120_000n, activeCampaigns: 1 });
    expect((await listRawPostbacks(db)).length).toBeGreaterThan(0);
    expect(await listPublisherPostbacks(db, 'pending')).toHaveLength(1);
  });

  it('rejects a held conversion without touching the ledger', async () => {
    const actor = await admin('operator');
    const { s, conversionId } = await heldConversion();
    await rejectHeldConversion(db, actor, conversionId, 'country looked spoofed');
    const conversion = (await db.query.conversions.findFirst({ where: eq(conversions.id, conversionId) }))!;
    expect(conversion).toMatchObject({ status: 'rejected' });
    expect(conversion.reasons).toContain('manual_review');
    expect(await getBalance(db, await getAccountId(db, 'advertiser_balance', s.advertiserId))).toBe(100_000n);
    await expect(rejectHeldConversion(db, await admin('finance'), conversionId, 'x'.repeat(5))).rejects.toThrow('yetkiniz');
  });
});

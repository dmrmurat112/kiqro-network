import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createAdminUser, type AdminUser } from '../src/admin/index.ts';
import { DEFAULT_PRICING_GUIDE, loadPricingGuide, platformPrices, savePricingGuide } from '../src/pricing-guide.ts';
import { applySiteTexts, loadSiteContent, saveSiteTexts, setSiteDefaultTheme, SITE_COPY, siteTextEntries } from '../src/site/index.ts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => resetTestDb(db));

async function staff(role: AdminUser['role'] = 'operator'): Promise<AdminUser> {
  const id = await createAdminUser(db, { email: `s${Math.random()}@kiqro.test`, name: 'Ops', role, password: 'correct horse battery' });
  return (await db.query.adminUsers.findFirst({ where: eq(schema.adminUsers.id, id) }))!;
}

describe('landing site content', () => {
  it('lists every text and number of the landing copy, including list items', () => {
    const paths = siteTextEntries().map((e) => e.path);
    expect(paths).toContain('hero.title1');
    expect(paths).toContain('hero.stats.0.value');
    expect(paths).toContain('mockup.spendValue');
    expect(paths).not.toContain('pricing.models.1.featured');
    expect(siteTextEntries().find((e) => e.path === 'hero.stats.0.value')).toMatchObject({ en: '70K+', tr: '70 bin+' });
  });

  it('applies overrides per locale, falls back to the defaults and keeps an audit trail', async () => {
    const actor = await staff();
    expect(await saveSiteTexts(db, actor, { 'hero.stats.0.value': { en: '80K+', tr: '80 bin+' }, 'hero.title1': { en: '', tr: 'Yeni başlık' } })).toBe(2);

    const { texts } = await loadSiteContent(db);
    const tr = applySiteTexts('tr', texts);
    const en = applySiteTexts('en', texts);
    expect(tr.hero.stats[0]!.value).toBe('80 bin+');
    expect(tr.hero.title1).toBe('Yeni başlık');
    expect(en.hero.title1).toBe(SITE_COPY.en.hero.title1);
    expect(SITE_COPY.tr.hero.title1).not.toBe('Yeni başlık'); // the code copy is not mutated

    // Emptying a field (or typing the default) removes the override.
    expect(await saveSiteTexts(db, actor, { 'hero.title1': { en: '', tr: '' }, 'hero.stats.0.value': { en: '80K+', tr: SITE_COPY.tr.hero.stats[0]!.value } })).toBe(2);
    expect((await loadSiteContent(db)).texts).toEqual({ 'hero.stats.0.value': { en: '80K+' } });
    expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'site.texts_updated'))).toHaveLength(2);
  });

  it('rejects unknown paths, viewers and invalid themes', async () => {
    const actor = await staff();
    await expect(saveSiteTexts(db, actor, { 'hero.nope': { en: 'x' } })).rejects.toThrow();
    await expect(saveSiteTexts(db, await staff('viewer'), { 'hero.title1': { en: 'x' } })).rejects.toThrow();
    await expect(setSiteDefaultTheme(db, actor, 'blue')).rejects.toThrow();
    expect((await loadSiteContent(db)).defaultTheme).toBe('light');
    await setSiteDefaultTheme(db, actor, 'dark');
    expect((await loadSiteContent(db)).defaultTheme).toBe('dark');
  });
});

describe('campaign pricing guide', () => {
  it('serves defaults, saves per-platform prices and help text, and rejects bad input', async () => {
    expect(await loadPricingGuide(db)).toEqual(DEFAULT_PRICING_GUIDE);
    const actor = await staff();
    const prices = { android: { ...DEFAULT_PRICING_GUIDE.prices.android, kyc: '4,5' }, ios: { ...DEFAULT_PRICING_GUIDE.prices.ios, trial: '7' } };
    await savePricingGuide(db, actor, { prices, help: { tr: 'Önerilen fiyat daha hızlı tamamlanır.', en: '' } });
    const guide = await loadPricingGuide(db);
    expect(guide.prices.android).toMatchObject({ kyc: '4.50', install: '0.60' });
    expect(guide.prices.ios).toMatchObject({ trial: '7.00', kyc: DEFAULT_PRICING_GUIDE.prices.ios.kyc });
    expect(platformPrices(guide, 'web')).toBe(guide.prices.android);
    expect(guide.help).toEqual({ tr: 'Önerilen fiyat daha hızlı tamamlanır.', en: DEFAULT_PRICING_GUIDE.help.en });
    expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'pricing_guide.updated'))).toHaveLength(1);

    await expect(savePricingGuide(db, actor, { prices: { ...prices, ios: { ...prices.ios, level: '-1' } }, help: {} })).rejects.toThrow();
    await expect(savePricingGuide(db, actor, { prices: { android: prices.android }, help: {} })).rejects.toThrow();
    await expect(savePricingGuide(db, await staff('viewer'), { prices, help: {} })).rejects.toThrow();
  });

  it('reads a list saved before prices were per platform as the price for both platforms', async () => {
    await db.insert(schema.siteSettings).values({ key: 'pricing_guide', value: { prices: { ...DEFAULT_PRICING_GUIDE.prices.android, kyc: '9.00' }, help: {} } });
    const guide = await loadPricingGuide(db);
    expect(guide.prices.android.kyc).toBe('9.00');
    expect(guide.prices.ios.kyc).toBe('9.00');
  });
});

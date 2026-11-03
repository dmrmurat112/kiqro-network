import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '@kiqro/db';
import { resetTestDb, setupTestDb } from '@kiqro/db/testing';
import { createAdminUser, type AdminUser } from '../src/admin/index.ts';
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
    expect((await loadSiteContent(db)).defaultTheme).toBe('dark');
    await setSiteDefaultTheme(db, actor, 'light');
    expect((await loadSiteContent(db)).defaultTheme).toBe('light');
  });
});

import { inArray, sql } from 'drizzle-orm';
import { schema, type Db } from '@kiqro/db';
import { audit } from '../admin/audit.ts';
import type { AdminUser } from '../admin/auth.ts';
import { AdminError, requirePermission } from '../admin/errors.ts';
import { SITE_COPY, type SiteCopy } from './copy.ts';

export { SITE_COPY, type SiteCopy } from './copy.ts';

const { siteSettings } = schema;

export type SiteLocale = keyof typeof SITE_COPY;
export type SiteTheme = 'dark' | 'light';
/** Admin overrides of the landing copy by dotted path; a missing locale falls back to the code copy. */
export type SiteTexts = Record<string, Partial<Record<SiteLocale, string>>>;
export interface SiteContent {
  texts: SiteTexts;
  defaultTheme: SiteTheme;
}

const MAX_TEXT = 2000;

export interface SiteTextEntry {
  /** Dotted path into the copy, e.g. "hero.title1" or "hero.stats.0.value". */
  path: string;
  en: string;
  tr: string;
}

/** Every editable text of the landing copy, in page order, with the defaults from code. */
export function siteTextEntries(): SiteTextEntry[] {
  const entries: SiteTextEntry[] = [];
  const walk = (en: unknown, tr: unknown, path: string) => {
    if (typeof en === 'string') {
      entries.push({ path, en, tr: typeof tr === 'string' ? tr : en });
    } else if (en && typeof en === 'object') {
      for (const [key, value] of Object.entries(en)) walk(value, (tr as Record<string, unknown> | null)?.[key], path ? `${path}.${key}` : key);
    }
  };
  walk(SITE_COPY.en, SITE_COPY.tr, '');
  return entries;
}

const EDITABLE = new Set(siteTextEntries().map((e) => e.path));

/** The landing copy for one locale with the admin's overrides applied. */
export function applySiteTexts(lang: SiteLocale, texts: SiteTexts): SiteCopy {
  const copy = structuredClone(SITE_COPY[lang]);
  for (const [path, values] of Object.entries(texts)) {
    const value = values[lang];
    if (!value || !EDITABLE.has(path)) continue;
    const keys = path.split('.');
    let node = copy as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
    node[keys.at(-1)!] = value;
  }
  return copy;
}

export async function loadSiteContent(db: Db): Promise<SiteContent> {
  const rows = await db.select().from(siteSettings).where(inArray(siteSettings.key, ['texts', 'theme']));
  const texts = rows.find((r) => r.key === 'texts')?.value;
  const theme = rows.find((r) => r.key === 'theme')?.value;
  return {
    texts: texts && typeof texts === 'object' ? (texts as SiteTexts) : {},
    defaultTheme: theme === 'dark' ? 'dark' : 'light',
  };
}

async function store(db: Db, actor: AdminUser, key: string, value: unknown, details: Record<string, unknown>): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(siteSettings)
      .values({ key, value, updatedBy: actor.id })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.id, updatedAt: sql`now()` } });
    await audit(tx, actor.id, `site.${key}_updated`, 'site', key, details);
  });
}

/**
 * Saves edited texts (only the paths submitted). An empty field, or one equal to the code
 * default, removes the override so the default applies again.
 */
export async function saveSiteTexts(db: Db, actor: AdminUser, updates: Record<string, Partial<Record<SiteLocale, string>>>): Promise<number> {
  requirePermission(actor, 'manage_campaigns');
  const defaults = new Map(siteTextEntries().map((e) => [e.path, e]));
  const texts = { ...(await loadSiteContent(db)).texts };
  const changed: string[] = [];
  for (const [path, values] of Object.entries(updates)) {
    const fallback = defaults.get(path);
    if (!fallback) throw new AdminError(`Bilinmeyen metin: ${path}`);
    const next: Partial<Record<SiteLocale, string>> = {};
    for (const lang of ['en', 'tr'] as const) {
      const value = (values[lang] ?? '').trim();
      if (value.length > MAX_TEXT) throw new AdminError(`${path}: en fazla ${MAX_TEXT} karakter.`);
      if (value && value !== fallback[lang]) next[lang] = value;
    }
    const before = JSON.stringify(texts[path] ?? {});
    if (Object.keys(next).length) texts[path] = next;
    else delete texts[path];
    if (JSON.stringify(texts[path] ?? {}) !== before) changed.push(path);
  }
  if (changed.length) await store(db, actor, 'texts', texts, { paths: changed });
  return changed.length;
}

export async function setSiteDefaultTheme(db: Db, actor: AdminUser, theme: string): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  if (theme !== 'dark' && theme !== 'light') throw new AdminError('Geçersiz tema.');
  await store(db, actor, 'theme', theme, { theme });
}

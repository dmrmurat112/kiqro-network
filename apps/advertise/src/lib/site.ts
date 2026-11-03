import 'server-only';
import { cookies } from 'next/headers';
import { applySiteTexts, loadSiteContent, type SiteContent } from '@kiqro/network/site';
import { db } from './db';
import type { Locale, SiteDict } from './i18n';
import { THEME_COOKIE } from './session';

/** Admin edits reach the site within this long (each server instance caches the settings). */
const TTL_MS = 30_000;
const FALLBACK: SiteContent = { texts: {}, defaultTheme: 'light' };
let cached: { at: number; content: Promise<SiteContent> } | null = null;

function siteContent(): Promise<SiteContent> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    // The site keeps working on the copy in code if the database is unreachable.
    const content = loadSiteContent(db).catch((e) => {
      console.error('site settings unavailable, using the default copy', e);
      cached = null;
      return FALLBACK;
    });
    cached = { at: Date.now(), content };
  }
  return cached.content;
}

/** Landing copy for one locale, with the texts edited in the admin panel. */
export async function siteCopy(lang: Locale): Promise<SiteDict> {
  return applySiteTexts(lang, (await siteContent()).texts);
}

/** The visitor's own choice (shared with the panel), else the default set in the admin panel. */
export async function siteTheme(): Promise<'dark' | 'light'> {
  const chosen = (await cookies()).get(THEME_COOKIE)?.value;
  if (chosen === 'dark' || chosen === 'light') return chosen;
  return (await siteContent()).defaultTheme;
}

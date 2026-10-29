import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADVERTISER_SESSION_TTL_MS, getAdvertiserSession, type AdvertiserSession } from '@kiqro/network/advertiser';
import { db } from './db';
import { isLocale, type Locale } from './i18n';

export const ADV_COOKIE = 'kq_adv';
export const LANG_COOKIE = 'kq_lang';
export const THEME_COOKIE = 'kq_theme';

export async function currentAdvertiser(): Promise<AdvertiserSession | null> {
  return getAdvertiserSession(db, (await cookies()).get(ADV_COOKIE)?.value);
}

/** The signed-in advertiser for panel pages and actions, or a redirect to /login. */
export async function requireAdvertiser(): Promise<AdvertiserSession> {
  const session = await currentAdvertiser();
  if (!session) redirect('/login');
  return session;
}

export async function setAdvertiserCookie(token: string): Promise<void> {
  (await cookies()).set(ADV_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADVERTISER_SESSION_TTL_MS / 1000,
  });
}

export async function panelLocale(): Promise<Locale> {
  const value = (await cookies()).get(LANG_COOKIE)?.value ?? '';
  return isLocale(value) ? value : 'en';
}

export async function panelTheme(): Promise<'dark' | 'light'> {
  return (await cookies()).get(THEME_COOKIE)?.value === 'light' ? 'light' : 'dark';
}

/** Advertiser-only pages: publishers are sent to their own panel. */
export async function requireAdvertiserOrg(): Promise<AdvertiserSession> {
  const session = await requireAdvertiser();
  if (session.org.type !== 'advertiser') redirect('/app/publisher');
  return session;
}

/** Publisher-only pages. */
export async function requirePublisherOrg(): Promise<AdvertiserSession> {
  const session = await requireAdvertiser();
  if (session.org.type !== 'publisher') redirect('/app');
  return session;
}

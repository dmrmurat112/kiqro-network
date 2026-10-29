'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { advertiserLogin, advertiserLogout, changeAdvertiserPassword } from '@kiqro/network/advertiser';
import { AdminError } from '@kiqro/network/admin';
import { db } from '@/lib/db';
import { isLocale } from '@/lib/i18n';
import { ADV_COOKIE, LANG_COOKIE, requireAdvertiser, setAdvertiserCookie, THEME_COOKIE } from '@/lib/session';

const YEAR = 365 * 24 * 3600;

export type FormState = { error?: 'invalid' | 'locked' | string; ok?: boolean } | undefined;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const h = await headers();
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const result = await advertiserLogin(db, { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? ''), ip });
  if (result.status !== 'ok') return { error: result.status };
  await setAdvertiserCookie(result.token);
  const jar = await cookies();
  if (!jar.has(LANG_COOKIE)) jar.set(LANG_COOKIE, result.locale, { path: '/', maxAge: YEAR, sameSite: 'lax' });
  redirect('/app');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADV_COOKIE)?.value;
  if (token) await advertiserLogout(db, token);
  jar.delete(ADV_COOKIE);
  redirect('/login');
}

export async function setPreferenceAction(form: FormData): Promise<void> {
  const jar = await cookies();
  const lang = String(form.get('lang') ?? '');
  const theme = String(form.get('theme') ?? '');
  if (isLocale(lang)) jar.set(LANG_COOKIE, lang, { path: '/', maxAge: YEAR, sameSite: 'lax' });
  if (theme === 'dark' || theme === 'light') jar.set(THEME_COOKIE, theme, { path: '/', maxAge: YEAR, sameSite: 'lax' });
  revalidatePath('/', 'layout');
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireAdvertiser();
  try {
    await changeAdvertiserPassword(db, user, String(form.get('current') ?? ''), String(form.get('next') ?? ''));
    return { ok: true };
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message };
    throw e;
  }
}

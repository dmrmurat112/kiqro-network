'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { login, logout } from '@kiqro/network/admin';
import { db } from '@/lib/db';
import { SESSION_COOKIE, setSessionCookie } from '@/lib/session';

export type LoginState = { error?: string; needCode?: boolean; email?: string } | undefined;

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  const ip = (await headers()).get('cf-connecting-ip') ?? (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const email = String(form.get('email') ?? '');
  const totpCode = String(form.get('code') ?? '').trim() || undefined;
  const result = await login(db, { email, password: String(form.get('password') ?? ''), totpCode, ip });

  switch (result.status) {
    case 'locked':
      return { error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.', email };
    case 'invalid':
      return { error: totpCode ? 'E-posta, parola veya doğrulama kodu hatalı.' : 'E-posta veya parola hatalı.', email, needCode: Boolean(totpCode) };
    case 'totp_required':
      return { needCode: true, email };
    case 'ok':
      await setSessionCookie(result.token);
      redirect(result.needsTotpSetup ? '/security' : '/');
  }
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await logout(db, token);
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { login, logout } from '@kiqro/network/admin';
import type { ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { SESSION_COOKIE, setSessionCookie } from '@/lib/session';

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const token = await login(db, String(form.get('email') ?? ''), String(form.get('password') ?? ''), ip);
  if (!token) return { error: 'E-posta veya parola hatalı.' };
  await setSessionCookie(token);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await logout(db, token);
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

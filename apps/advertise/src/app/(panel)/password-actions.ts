'use server';

import { redirect } from 'next/navigation';
import { requestPasswordReset, setPasswordWithToken } from '@kiqro/network/advertiser';
import { db } from '@/lib/db';

const links = () => ({ advertiseBaseUrl: process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200' });

export type ResetState = { sent?: boolean } | undefined;

/** Always reports "sent", whether or not the address has an account. */
export async function requestResetAction(_: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get('email') ?? '').trim();
  if (email) await requestPasswordReset(db, email, links());
  return { sent: true };
}

export type SetPasswordState = { error?: 'mismatch' | 'weak' | 'invalid' } | undefined;

export async function setPasswordAction(token: string, _: SetPasswordState, form: FormData): Promise<SetPasswordState> {
  const password = String(form.get('password') ?? '');
  if (password !== String(form.get('confirm') ?? '')) return { error: 'mismatch' };
  const result = await setPasswordWithToken(db, token, password);
  if (!result.ok) return { error: result.reason === 'weak_password' ? 'weak' : 'invalid' };
  redirect('/login?password=set');
}

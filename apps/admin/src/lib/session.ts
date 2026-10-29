import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser, SESSION_TTL_MS, type AdminUser } from '@kiqro/network/admin';
import { db } from './db';

export const SESSION_COOKIE = 'kq_admin';

export async function currentAdmin(): Promise<AdminUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(db, token);
}

/**
 * For pages and server actions: the signed-in admin, or a redirect. 2FA is mandatory, so a
 * session without enrolled 2FA can only reach the /security page (allowWithoutTotp).
 */
export async function requireAdmin(opts: { allowWithoutTotp?: boolean } = {}): Promise<AdminUser> {
  const user = await currentAdmin();
  if (!user) redirect('/login');
  if (!user.totpEnabledAt && !opts.allowWithoutTotp) redirect('/security');
  return user;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

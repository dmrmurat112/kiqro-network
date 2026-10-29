'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { acceptAdvertiserTerms } from '@kiqro/network/advertiser';
import { CURRENT_TERMS_VERSION } from '@/content/legal';
import { db } from '@/lib/db';
import { requireAdvertiser } from '@/lib/session';

export async function acceptTermsAction(_: { error?: boolean } | undefined, form: FormData): Promise<{ error?: boolean } | undefined> {
  const { user } = await requireAdvertiser();
  if (form.get('accept') !== 'on') return { error: true };
  const h = await headers();
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  await acceptAdvertiserTerms(db, user, CURRENT_TERMS_VERSION, ip);
  redirect('/app');
}

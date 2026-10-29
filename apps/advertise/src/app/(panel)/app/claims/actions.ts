'use server';

import { revalidatePath } from 'next/cache';
import { decideClaim } from '@kiqro/network';
import { db } from '@/lib/db';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';

export type DecideState = { error?: string; done?: 'approved' | 'rejected' } | undefined;

export async function decideClaimAction(claimId: string, _: DecideState, form: FormData): Promise<DecideState> {
  const [{ org, user }, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const approve = form.get('decision') === 'approve';
  const result = await decideClaim(db, claimId, { approve, note: String(form.get('note') ?? ''), orgId: org.id, advertiserUserId: user.id });
  if (!result.ok) return { error: PANEL[lang].claims.errors[result.reason] ?? result.reason };
  revalidatePath('/app/claims');
  return { done: approve ? 'approved' : 'rejected' };
}

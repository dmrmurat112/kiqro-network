'use server';

import { revalidatePath } from 'next/cache';
import type { FieldIssue } from '@kiqro/network';
import { updateBillingDetails } from '@kiqro/network/advertiser';
import { db } from '@/lib/db';
import { panelLocale, requireAdvertiser } from '@/lib/session';

export type BillingDetailsState = { ok?: boolean; issues?: FieldIssue[] } | undefined;

export async function billingDetailsAction(_: BillingDetailsState, form: FormData): Promise<BillingDetailsState> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const result = await updateBillingDetails(
    db,
    session,
    {
      legalName: String(form.get('legalName') ?? ''),
      billingAddress: String(form.get('billingAddress') ?? ''),
      vatId: String(form.get('vatId') ?? ''),
      billingEmail: String(form.get('billingEmail') ?? ''),
    },
    lang,
  );
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/account');
  return { ok: true };
}

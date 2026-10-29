'use server';

import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import type { FieldIssue } from '@kiqro/network';
import { confirmAdvertiserTotp, disableAdvertiserTotp, startAdvertiserTotp, updateBillingDetails } from '@kiqro/network/advertiser';
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

export type TotpState = { ok?: boolean; issues?: FieldIssue[] } | undefined;

/** Starts 2FA setup and returns the key with its QR code (SVG). */
export async function startTotpAction(): Promise<{ secret: string; svg: string } | null> {
  const { user } = await requireAdvertiser();
  const started = await startAdvertiserTotp(db, user);
  if (!started) return null;
  return { secret: started.secret, svg: await QRCode.toString(started.uri, { type: 'svg', margin: 1, width: 164 }) };
}

export async function confirmTotpAction(_: TotpState, form: FormData): Promise<TotpState> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const result = await confirmAdvertiserTotp(db, session, String(form.get('code') ?? ''), lang);
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/account');
  return { ok: true };
}

export async function disableTotpAction(_: TotpState, form: FormData): Promise<TotpState> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const result = await disableAdvertiserTotp(db, session, String(form.get('password') ?? ''), String(form.get('code') ?? ''), lang);
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/account');
  return { ok: true };
}

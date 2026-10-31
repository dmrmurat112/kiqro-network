'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { lookupStoreApp, parseStoreInput, websiteApp, type FieldIssue, type StoreApp } from '@kiqro/network';
import {
  banUser,
  createCurrencySale,
  createPublisherPlacement,
  deletePublisherPlacement,
  endCurrencySale,
  sendTestPostback,
  sendTesterPostback,
  setPlacementStatus,
  unbanUser,
  updatePlacementProfile,
  updatePlacementSettings,
} from '@kiqro/network/publisher';
import { db } from '@/lib/db';
import { panelLocale, requirePublisherOrg } from '@/lib/session';

export type PlacementState = { ok?: boolean; issues?: FieldIssue[] } | undefined;

export async function placementSettingsAction(placementId: string, _: PlacementState, form: FormData): Promise<PlacementState> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const result = await updatePlacementSettings(
    db,
    session,
    placementId,
    {
      currencyName: String(form.get('currencyName') ?? ''),
      pointsPerUsd: String(form.get('pointsPerUsd') ?? ''),
      postbackUrl: String(form.get('postbackUrl') ?? ''),
      brandColor: String(form.get('brandColor') ?? ''),
      logoUrl: String(form.get('logoUrl') ?? ''),
      wallTitle: String(form.get('wallTitle') ?? ''),
    },
    lang,
  );
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/publisher/placements');
  revalidatePath(`/app/publisher/placements/${placementId}`);
  return { ok: true };
}

export async function testPostbackAction(placementId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const session = await requirePublisherOrg();
  const result = await sendTestPostback(db, session, placementId);
  return { ok: result.ok, status: 'status' in result ? result.status : undefined, error: 'error' in result ? result.error : undefined };
}

/** Name and icon of an app (Google Play / App Store) or a website's favicon, for the new-placement form. */
export async function lookupPlacementAppAction(raw: string, platform: string): Promise<StoreApp | null> {
  await requirePublisherOrg();
  if (platform === 'web') return websiteApp(raw);
  const ref = parseStoreInput(raw, platform);
  return ref ? lookupStoreApp(ref) : null;
}

export type NewPlacementInput = { type: string; name: string; storeUrl: string; iconUrl: string; currencyName: string; pointsPerUsd: string; postbackUrl: string };

export async function createPlacementAction(input: NewPlacementInput): Promise<{ issues: FieldIssue[] }> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const result = await createPublisherPlacement(db, session, input, lang);
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/publisher/placements');
  redirect(`/app/publisher/placements/${result.id}?created=1`);
}

export async function placementProfileAction(placementId: string, _: PlacementState, form: FormData): Promise<PlacementState> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const result = await updatePlacementProfile(db, session, placementId, { name: String(form.get('name') ?? ''), storeUrl: String(form.get('storeUrl') ?? '') }, lang);
  if (!result.ok) return { issues: result.issues };
  revalidatePath(`/app/publisher/placements/${placementId}`);
  return { ok: true };
}

export async function placementStatusAction(placementId: string, status: 'active' | 'paused'): Promise<void> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  await setPlacementStatus(db, session, placementId, status, lang);
  revalidatePath('/app/publisher/placements');
  revalidatePath(`/app/publisher/placements/${placementId}`);
}

export async function deletePlacementAction(placementId: string): Promise<{ issues?: FieldIssue[] }> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const result = await deletePublisherPlacement(db, session, placementId, lang);
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/publisher/placements');
  redirect('/app/publisher/placements?deleted=1');
}

/** datetime-local values (no zone) are entered as UTC in the panel. */
const utc = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00Z` : s;
};

export async function createSaleAction(placementId: string, _: PlacementState, form: FormData): Promise<PlacementState> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const result = await createCurrencySale(
    db,
    session,
    placementId,
    { multiplier: String(form.get('multiplier') ?? '').replace(',', '.'), startsAt: utc(form.get('startsAt')), endsAt: utc(form.get('endsAt')) },
    lang,
  );
  if (!result.ok) return { issues: result.issues };
  revalidatePath(`/app/publisher/placements/${placementId}`);
  return { ok: true };
}

export async function endSaleAction(placementId: string, saleId: string): Promise<void> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  await endCurrencySale(db, session, saleId, lang);
  revalidatePath(`/app/publisher/placements/${placementId}`);
}

export type TesterState = { issues?: FieldIssue[]; status?: number; error?: string; url?: string } | undefined;

export async function testerPostbackAction(placementId: string, _: TesterState, form: FormData): Promise<TesterState> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const f = (k: string) => String(form.get(k) ?? '');
  const result = await sendTesterPostback(
    db,
    session,
    placementId,
    {
      userId: f('userId'),
      offerId: f('offerId') || undefined,
      offerName: f('offerName') || undefined,
      taskId: f('taskId') || undefined,
      taskName: f('taskName') || undefined,
      amount: f('amount'),
      payoutUsd: f('payoutUsd') || undefined,
      status: f('status'),
      custom: [1, 2, 3, 4, 5].map((n) => f(`custom_${n}`)),
    },
    lang,
  );
  if (!result.ok) return { issues: result.issues };
  return { status: result.status, error: result.error, url: result.url };
}

export async function banUserAction(_: PlacementState, form: FormData): Promise<PlacementState> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const result = await banUser(db, session.org.id, { userId: String(form.get('userId') ?? ''), reason: String(form.get('reason') ?? '') }, lang, session);
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/publisher/bans');
  return { ok: true };
}

export async function unbanUserAction(userId: string): Promise<void> {
  const session = await requirePublisherOrg();
  await unbanUser(db, session.org.id, userId, session);
  revalidatePath('/app/publisher/bans');
}

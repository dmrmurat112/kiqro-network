'use server';

import { revalidatePath } from 'next/cache';
import type { FieldIssue } from '@kiqro/network';
import { sendTestPostback, updatePlacementSettings } from '@kiqro/network/publisher';
import { db } from '@/lib/db';
import { panelLocale, requirePublisherOrg } from '@/lib/session';

export type PlacementState = { ok?: boolean; issues?: FieldIssue[] } | undefined;

export async function placementSettingsAction(placementId: string, _: PlacementState, form: FormData): Promise<PlacementState> {
  const [session, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const result = await updatePlacementSettings(
    db,
    session,
    placementId,
    { currencyName: String(form.get('currencyName') ?? ''), pointsPerUsd: String(form.get('pointsPerUsd') ?? ''), postbackUrl: String(form.get('postbackUrl') ?? '') },
    lang,
  );
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/publisher/placements');
  return { ok: true };
}

export async function testPostbackAction(placementId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const session = await requirePublisherOrg();
  const result = await sendTestPostback(db, session, placementId);
  return { ok: result.ok, status: 'status' in result ? result.status : undefined, error: 'error' in result ? result.error : undefined };
}

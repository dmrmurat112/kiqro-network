'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { CampaignInput } from '@kiqro/network/admin';
import { advertiserCreateProduct, advertiserSaveCampaign, advertiserSetPaused, submitCampaignForReview } from '@kiqro/network/advertiser';
import { lookupStoreApp, parseStoreInput, type FieldIssue, type StoreApp } from '@kiqro/network';
import { db } from '@/lib/db';
import { panelLocale, requireAdvertiser } from '@/lib/session';

const reviewNotify = () => ({
  to: process.env.REVIEW_NOTIFY_EMAIL ?? process.env.LEADS_NOTIFY_EMAIL,
  adminBaseUrl: process.env.ADMIN_BASE_URL ?? 'http://localhost:4100',
});

export type ProductResult =
  | { ok: true; product: { id: string; name: string; platform: string; storeId: string; mmp: string | null; iconUrl: string | null } }
  | { ok: false; issues: FieldIssue[] };

/** Store icons are only accepted from the stores' own image hosts. */
const STORE_ICON = /^https:\/\/(play-lh\.googleusercontent\.com|is\d+-ssl\.mzstatic\.com)\//;

/** Name, icon and developer of an app from Google Play or the App Store, for the wizard. */
export async function lookupStoreAppAction(raw: string, platform: string): Promise<StoreApp | null> {
  await requireAdvertiser();
  const ref = parseStoreInput(raw, platform);
  return ref ? lookupStoreApp(ref) : null;
}

export async function createProductAction(input: { platform: string; storeId: string; name: string; mmp: string; iconUrl?: string }): Promise<ProductResult> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const iconUrl = input.iconUrl && STORE_ICON.test(input.iconUrl) ? input.iconUrl : '';
  const result = await advertiserCreateProduct(db, session, { ...input, iconUrl }, lang);
  if (!result.ok) return result;
  return { ok: true, product: { id: result.id, name: input.name, platform: input.platform, storeId: input.storeId, mmp: input.mmp, iconUrl: iconUrl || null } };
}

/** Saves the wizard; with intent "submit" it also sends the draft to Kiqro for review. */
export async function saveCampaignAction(input: CampaignInput, intent: 'save' | 'submit', campaignId?: string): Promise<{ issues: FieldIssue[] }> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const saved = await advertiserSaveCampaign(db, session, input, lang, campaignId);
  if (!saved.ok) return { issues: saved.issues };
  if (intent === 'submit') {
    const submitted = await submitCampaignForReview(db, session, saved.id, lang, reviewNotify());
    if (!submitted.ok) return { issues: submitted.issues };
  }
  revalidatePath('/app/campaigns');
  redirect(`/app/campaigns?${intent === 'submit' ? 'submitted' : 'saved'}=${saved.id}`);
}

export async function submitCampaignAction(campaignId: string): Promise<void> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  await submitCampaignForReview(db, session, campaignId, lang, reviewNotify());
  revalidatePath('/app/campaigns');
  redirect(`/app/campaigns?submitted=${campaignId}`);
}

export async function setPausedAction(campaignId: string, paused: boolean): Promise<void> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  await advertiserSetPaused(db, session, campaignId, paused, lang);
  revalidatePath('/app/campaigns');
}

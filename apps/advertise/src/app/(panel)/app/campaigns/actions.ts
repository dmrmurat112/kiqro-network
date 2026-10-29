'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { CampaignInput } from '@kiqro/network/admin';
import { advertiserCreateProduct, advertiserDeleteProduct, advertiserUpdateProduct, advertiserSaveCampaign, advertiserSetPaused, submitCampaignForReview } from '@kiqro/network/advertiser';
import { lookupStoreApp, parseStoreInput, websiteApp, type FieldIssue, type StoreApp } from '@kiqro/network';
import { db } from '@/lib/db';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';

const reviewNotify = () => ({
  to: process.env.REVIEW_NOTIFY_EMAIL ?? process.env.LEADS_NOTIFY_EMAIL,
  adminBaseUrl: process.env.ADMIN_BASE_URL ?? 'http://localhost:4100',
});

export type ProductResult =
  | { ok: true; product: { id: string; name: string; platform: string; storeId: string; mmp: string | null; iconUrl: string | null } }
  | { ok: false; issues: FieldIssue[] };

/** Icons are only accepted from the stores' image hosts and the favicon service used for websites. */
const STORE_ICON = /^https:\/\/(play-lh\.googleusercontent\.com\/|is\d+-ssl\.mzstatic\.com\/|www\.google\.com\/s2\/favicons\?)/;

type ProductInput = { platform: string; storeId: string; name: string; mmp: string; iconUrl?: string };
const safeIcon = (url?: string) => (url && STORE_ICON.test(url) ? url : '');

/** Name, icon and developer of an app from Google Play or the App Store (or a website's favicon), for the wizard. */
export async function lookupStoreAppAction(raw: string, platform: string): Promise<StoreApp | null> {
  await requireAdvertiserOrg();
  if (platform === 'web') return websiteApp(raw);
  const ref = parseStoreInput(raw, platform);
  return ref ? lookupStoreApp(ref) : null;
}

export async function createProductAction(input: ProductInput): Promise<ProductResult> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const iconUrl = safeIcon(input.iconUrl);
  const result = await advertiserCreateProduct(db, session, { ...input, iconUrl }, lang);
  if (!result.ok) return result;
  return { ok: true, product: { id: result.id, name: input.name, platform: input.platform, storeId: input.storeId, mmp: input.mmp, iconUrl: iconUrl || null } };
}

export async function updateProductAction(productId: string, input: ProductInput): Promise<ProductResult> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const iconUrl = safeIcon(input.iconUrl);
  const result = await advertiserUpdateProduct(db, session, productId, { ...input, iconUrl }, lang);
  if (!result.ok) return result;
  return { ok: true, product: { id: productId, name: input.name, platform: input.platform, storeId: input.storeId, mmp: input.mmp, iconUrl: iconUrl || null } };
}

export async function deleteProductAction(productId: string): Promise<{ ok: boolean; issues?: FieldIssue[] }> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const result = await advertiserDeleteProduct(db, session, productId, lang);
  return result.ok ? { ok: true } : result;
}

/** Saves the wizard; with intent "submit" it also sends the draft to Kiqro for review. */
export async function saveCampaignAction(input: CampaignInput, intent: 'save' | 'submit', campaignId?: string): Promise<{ issues: FieldIssue[] }> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
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
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  await submitCampaignForReview(db, session, campaignId, lang, reviewNotify());
  revalidatePath('/app/campaigns');
  redirect(`/app/campaigns?submitted=${campaignId}`);
}

export async function setPausedAction(campaignId: string, paused: boolean): Promise<void> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  await advertiserSetPaused(db, session, campaignId, paused, lang);
  revalidatePath('/app/campaigns');
}

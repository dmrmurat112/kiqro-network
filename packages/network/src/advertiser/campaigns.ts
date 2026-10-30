import { and, eq, inArray } from 'drizzle-orm';
import { parseMicros } from '@kiqro/core';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { campaignInput, campaignValues, getCampaignForm, writeTasks, type CampaignInput } from '../admin/campaigns.ts';
import { productInput } from '../admin/organizations.ts';
import { enqueueEmail } from '../email/queue.ts';
import { localizedIssues, translateMessage, type FieldIssue, type UiLocale } from '../validation.ts';
import type { AdvertiserSession } from './auth.ts';

const { auditLog, campaignTasks, campaigns, products, taskPayouts } = schema;

/** Smallest total budget an advertiser may set on a self-serve campaign. */
export const MIN_CAMPAIGN_BUDGET_USD = '100';

export type SaveResult = { ok: true; id: string } | { ok: false; issues: FieldIssue[] };

const fail = (key: string, locale: UiLocale, path = ''): SaveResult => ({ ok: false, issues: [{ path, message: translateMessage(key, locale) }] });

async function auditAdvertiser(db: DbOrTx, session: AdvertiserSession, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({
    id: newId('audit'),
    adminUserId: null,
    action,
    entityType,
    entityId,
    details: { ...details, advertiserUserId: session.user.id, orgId: session.org.id },
  });
}

/** Adds an app to the advertiser's own organization. */
export async function advertiserCreateProduct(db: Db, session: AdvertiserSession, input: unknown, locale: UiLocale): Promise<SaveResult> {
  const parsed = productInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: localizedIssues(parsed.error, locale) };
  const d = parsed.data;
  const id = newId('product');
  return db.transaction(async (tx) => {
    const duplicate = await tx.query.products.findFirst({ where: and(eq(products.orgId, session.org.id), eq(products.platform, d.platform), eq(products.storeId, d.storeId)) });
    if (duplicate) return fail('app_exists', locale, 'storeId');
    await tx.insert(products).values({ id, orgId: session.org.id, platform: d.platform, storeId: d.storeId, name: d.name, iconUrl: d.iconUrl ?? null, coverUrl: d.coverUrl ?? null, mmp: d.mmp });
    await auditAdvertiser(tx, session, 'advertiser.product.create', 'product', id, { name: d.name });
    return { ok: true, id } as const;
  });
}

/** Campaigns of this app that are past the draft stage (submitted, live or finished). */
async function liveCampaignCount(db: DbOrTx, productId: string): Promise<number> {
  const rows = await db.select({ id: campaigns.id, status: campaigns.status }).from(campaigns).where(eq(campaigns.productId, productId));
  return rows.filter((r) => r.status !== 'draft').length;
}

/**
 * Edits an app. Name, icon, cover and MMP can always change; the platform and store ID only while no
 * campaign of the app has gone beyond draft, because live tracking links and payouts refer to them.
 */
export async function advertiserUpdateProduct(db: Db, session: AdvertiserSession, productId: string, input: unknown, locale: UiLocale): Promise<SaveResult> {
  const parsed = productInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: localizedIssues(parsed.error, locale) };
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const product = await tx.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.orgId, session.org.id)) });
    if (!product) return fail('app_not_found', locale);
    const identityChanged = product.platform !== d.platform || product.storeId !== d.storeId;
    if (identityChanged) {
      if ((await liveCampaignCount(tx, productId)) > 0) return fail('app_identity_locked', locale, 'storeId');
      const duplicate = await tx.query.products.findFirst({ where: and(eq(products.orgId, session.org.id), eq(products.platform, d.platform), eq(products.storeId, d.storeId)) });
      if (duplicate && duplicate.id !== productId) return fail('app_exists', locale, 'storeId');
    }
    await tx.update(products).set({ platform: d.platform, storeId: d.storeId, name: d.name, iconUrl: d.iconUrl ?? null, coverUrl: d.coverUrl ?? null, mmp: d.mmp }).where(eq(products.id, productId));
    await auditAdvertiser(tx, session, 'advertiser.product.update', 'product', productId, {
      before: { platform: product.platform, storeId: product.storeId, name: product.name, mmp: product.mmp },
      after: { platform: d.platform, storeId: d.storeId, name: d.name, mmp: d.mmp },
    });
    return { ok: true, id: productId } as const;
  });
}

/** Deletes an app that no campaign uses (drafts included; delete those first). */
export async function advertiserDeleteProduct(db: Db, session: AdvertiserSession, productId: string, locale: UiLocale): Promise<SaveResult> {
  return db.transaction(async (tx) => {
    const product = await tx.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.orgId, session.org.id)) });
    if (!product) return fail('app_not_found', locale);
    const used = await tx.query.campaigns.findFirst({ where: eq(campaigns.productId, productId), columns: { id: true } });
    if (used) return fail('app_in_use', locale);
    await tx.delete(products).where(eq(products.id, productId));
    await auditAdvertiser(tx, session, 'advertiser.product.delete', 'product', productId, { name: product.name, storeId: product.storeId });
    return { ok: true, id: productId } as const;
  });
}

/**
 * Creates or updates a self-serve campaign draft. Validation is the same as in the admin
 * panel; drafts never serve traffic until Kiqro approves them.
 */
export async function advertiserSaveCampaign(db: Db, session: AdvertiserSession, input: CampaignInput, locale: UiLocale, campaignId?: string): Promise<SaveResult> {
  const parsed = campaignInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: localizedIssues(parsed.error, locale) };
  const data = parsed.data;
  if (parseMicros(data.totalBudgetUsd) < parseMicros(MIN_CAMPAIGN_BUDGET_USD)) return fail(`budget_minimum|${MIN_CAMPAIGN_BUDGET_USD}`, locale, 'totalBudgetUsd');

  return db.transaction(async (tx) => {
    const product = await tx.query.products.findFirst({ where: and(eq(products.id, data.productId), eq(products.orgId, session.org.id)) });
    if (!product) return fail('product_required', locale, 'productId');

    if (campaignId) {
      const campaign = await tx.query.campaigns.findFirst({ where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, session.org.id)) });
      if (!campaign) return fail('not_found', locale);
      if (campaign.status !== 'draft') return fail('not_editable', locale);
      await tx.update(campaigns).set({ ...campaignValues(data), productId: product.id }).where(eq(campaigns.id, campaignId));
      const old = await tx.select({ id: campaignTasks.id }).from(campaignTasks).where(eq(campaignTasks.campaignId, campaignId));
      if (old.length) {
        await tx.delete(taskPayouts).where(inArray(taskPayouts.taskId, old.map((t) => t.id)));
        await tx.delete(campaignTasks).where(eq(campaignTasks.campaignId, campaignId));
      }
      await writeTasks(tx, campaignId, data.tasks);
      await auditAdvertiser(tx, session, 'advertiser.campaign.update', 'campaign', campaignId);
      return { ok: true, id: campaignId } as const;
    }

    const id = newId('campaign');
    await tx.insert(campaigns).values({ id, orgId: session.org.id, productId: product.id, status: 'draft', createdBy: session.user.id, ...campaignValues(data) });
    await writeTasks(tx, id, data.tasks);
    await auditAdvertiser(tx, session, 'advertiser.campaign.create', 'campaign', id, { name: data.name });
    return { ok: true, id } as const;
  });
}

export interface ReviewNotify {
  /** Kiqro inbox that reviews submissions (REVIEW_NOTIFY_EMAIL). */
  to?: string;
  adminBaseUrl: string;
}

/** Sends a draft to Kiqro for review. The campaign is locked for the advertiser while in review. */
export async function submitCampaignForReview(db: Db, session: AdvertiserSession, campaignId: string, locale: UiLocale, notify: ReviewNotify, now = new Date()): Promise<SaveResult> {
  return db.transaction(async (tx) => {
    const campaign = await tx.query.campaigns.findFirst({ where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, session.org.id)) });
    if (!campaign) return fail('not_found', locale);
    if (campaign.status !== 'draft') return fail('not_submittable', locale);
    await tx.update(campaigns).set({ status: 'in_review', submittedAt: now, reviewNote: null }).where(eq(campaigns.id, campaignId));
    await auditAdvertiser(tx, session, 'advertiser.campaign.submit', 'campaign', campaignId);
    if (notify.to) {
      await enqueueEmail(
        tx,
        notify.to,
        {
          name: 'campaign_submitted',
          data: { company: session.org.name, campaign: campaign.name, submittedBy: `${session.user.name} <${session.user.email}>`, adminLink: `${notify.adminBaseUrl.replace(/\/$/, '')}/campaigns/${campaignId}` },
        },
        'tr',
        now,
      );
    }
    return { ok: true, id: campaignId } as const;
  });
}

/** Pause or resume a live campaign. */
export async function advertiserSetPaused(db: Db, session: AdvertiserSession, campaignId: string, paused: boolean, locale: UiLocale): Promise<SaveResult> {
  return db.transaction(async (tx) => {
    const campaign = await tx.query.campaigns.findFirst({ where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, session.org.id)) });
    if (!campaign) return fail('not_found', locale);
    const allowed = paused ? campaign.status === 'active' : campaign.status === 'paused';
    if (!allowed) return fail('not_pausable', locale);
    await tx.update(campaigns).set({ status: paused ? 'paused' : 'active' }).where(eq(campaigns.id, campaignId));
    await auditAdvertiser(tx, session, paused ? 'advertiser.campaign.pause' : 'advertiser.campaign.resume', 'campaign', campaignId);
    return { ok: true, id: campaignId } as const;
  });
}

/** The campaign in form shape, only if it belongs to the advertiser. */
export async function advertiserCampaignForm(db: Db, session: AdvertiserSession, campaignId: string) {
  const data = await getCampaignForm(db, campaignId);
  return data && data.campaign.orgId === session.org.id ? data : null;
}

export async function advertiserProducts(db: Db, session: AdvertiserSession) {
  return db.select().from(products).where(eq(products.orgId, session.org.id));
}

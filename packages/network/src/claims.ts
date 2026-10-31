import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { applyBps, toPoints, verify } from '@kiqro/core';
import { getAccountId, lockAccount, newId, schema, type Db, type Tx } from '@kiqro/db';
import { creditPosition } from './billing/credit.ts';
import { priceFor } from './campaigns.ts';
import { creditConversion } from './conversions.ts';
import { enqueuePublisherPostback } from './outbox.ts';
import { conversionEventData, emitWebhook } from './webhooks.ts';

const { auditLog, campaignTasks, campaigns, claims, clicks, conversions, placements } = schema;

/** Users may claim a missing reward up to this many days after their click. */
export const CLAIM_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export type ClaimStatus = (typeof claims.$inferSelect)['status'];

export type FileClaimResult =
  | { ok: true; claimId: string; status: ClaimStatus }
  | { ok: false; status: 400 | 403 | 404 | 409; reason: string };

/** Fields of a claim covered by the publisher's signature. */
export const claimSignedParts = (appKey: string, userId: string, campaignId: string, taskId: string) => [appKey, userId, campaignId, taskId];

/**
 * A publisher files a missing-credit claim for one of its users:
 * POST /v1/claims, sig = HMAC(placement secret, app_key|user_id|campaign_id|task_id).
 * The claim is matched to the user's latest click on the campaign; filing again for the same
 * task returns the existing claim.
 */
export async function fileClaim(
  db: Db,
  input: { appKey: string; publisherUserId: string; campaignId: string; taskId: string; note?: string; signature: string; now?: Date },
): Promise<FileClaimResult> {
  const now = input.now ?? new Date();
  if (!input.appKey || !input.publisherUserId || !input.campaignId || !input.taskId) return { ok: false, status: 400, reason: 'missing_parameters' };
  const placement = await db.query.placements.findFirst({ where: eq(placements.appKey, input.appKey) });
  if (!placement || placement.status !== 'active') return { ok: false, status: 404, reason: 'unknown_placement' };
  if (!verify(placement.secret, claimSignedParts(input.appKey, input.publisherUserId, input.campaignId, input.taskId), input.signature)) {
    return { ok: false, status: 403, reason: 'invalid_signature' };
  }
  const task = await db.query.campaignTasks.findFirst({ where: and(eq(campaignTasks.id, input.taskId), eq(campaignTasks.campaignId, input.campaignId)) });
  if (!task) return { ok: false, status: 404, reason: 'unknown_task' };

  const click = await db.query.clicks.findFirst({
    where: and(
      eq(clicks.placementId, placement.id),
      eq(clicks.publisherUserId, input.publisherUserId),
      eq(clicks.campaignId, input.campaignId),
      gte(clicks.createdAt, new Date(now.getTime() - CLAIM_WINDOW_DAYS * DAY_MS)),
    ),
    orderBy: desc(clicks.createdAt),
  });
  if (!click) return { ok: false, status: 409, reason: 'no_click' };

  const rewarded = await db.query.conversions.findFirst({
    where: and(eq(conversions.placementId, placement.id), eq(conversions.publisherUserId, input.publisherUserId), eq(conversions.taskId, task.id), eq(conversions.status, 'approved')),
  });
  if (rewarded) return { ok: false, status: 409, reason: 'already_rewarded' };

  const existing = await db.query.claims.findFirst({
    where: and(eq(claims.placementId, placement.id), eq(claims.publisherUserId, input.publisherUserId), eq(claims.taskId, task.id), inArray(claims.status, ['open', 'rejected'])),
    orderBy: desc(claims.createdAt),
  });
  if (existing) return { ok: true, claimId: existing.id, status: existing.status };

  const claimId = newId('claim');
  const note = input.note?.trim().slice(0, 1000) || null;
  const campaign = (await db.query.campaigns.findFirst({ where: eq(campaigns.id, input.campaignId), columns: { orgId: true } }))!;
  await db.transaction(async (tx) => {
    await tx.insert(claims).values({
      id: claimId,
      placementId: placement.id,
      publisherUserId: input.publisherUserId,
      campaignId: input.campaignId,
      taskId: task.id,
      clickId: click.id,
      userNote: note,
      createdAt: now,
    });
    await emitWebhook(tx, campaign.orgId, 'claim.created', {
      claim_id: claimId,
      campaign_id: input.campaignId,
      task_event: task.mmpEventName,
      click_id: click.id,
      user_note: note,
    }, now);
  });
  return { ok: true, claimId, status: 'open' };
}

/** A publisher user's claims (newest first), for showing their status in the publisher's app. */
export async function listUserClaims(db: Db, input: { appKey: string; publisherUserId: string; signature: string }) {
  const placement = await db.query.placements.findFirst({ where: eq(placements.appKey, input.appKey) });
  if (!placement || !verify(placement.secret, [input.appKey, input.publisherUserId], input.signature)) return null;
  return db
    .select({ id: claims.id, campaignId: claims.campaignId, taskId: claims.taskId, status: claims.status, decisionNote: claims.decisionNote, createdAt: claims.createdAt, decidedAt: claims.decidedAt })
    .from(claims)
    .where(and(eq(claims.placementId, placement.id), eq(claims.publisherUserId, input.publisherUserId)))
    .orderBy(desc(claims.createdAt))
    .limit(100);
}

export type DecideResult = { ok: true } | { ok: false; reason: 'claim_not_found' | 'claim_not_open' | 'claim_note_required' | 'claim_no_price' | 'claim_balance' | 'claim_reversed' };

/**
 * Approves or rejects an open claim. Approving bills the advertiser and rewards the user exactly
 * like a postback would (balance and credit line are checked); an existing held or rejected
 * conversion for the same click and task is approved instead of creating a second one.
 * `orgId` scopes advertisers to their own campaigns; Kiqro staff pass null.
 */
export async function decideClaim(
  db: Db,
  claimId: string,
  decision: { approve: boolean; note: string; orgId: string | null; advertiserUserId?: string; adminUserId?: string },
  now = new Date(),
): Promise<DecideResult> {
  const note = decision.note.trim();
  if (!decision.approve && note.length < 3) return { ok: false, reason: 'claim_note_required' };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ claim: claims, campaign: campaigns, click: clicks, placement: placements })
      .from(claims)
      .innerJoin(campaigns, eq(campaigns.id, claims.campaignId))
      .innerJoin(clicks, eq(clicks.id, claims.clickId))
      .innerJoin(placements, eq(placements.id, claims.placementId))
      .where(eq(claims.id, claimId))
      .for('update', { of: claims });
    if (!row || (decision.orgId && row.campaign.orgId !== decision.orgId)) return { ok: false, reason: 'claim_not_found' };
    if (row.claim.status !== 'open') return { ok: false, reason: 'claim_not_open' };

    let conversionId: string | null = null;
    if (decision.approve) {
      const result = await creditClaim(tx, row, now);
      if (typeof result !== 'string') return result;
      conversionId = result;
    }
    await tx
      .update(claims)
      .set({
        status: decision.approve ? 'approved' : 'rejected',
        decisionNote: note || null,
        decidedAt: now,
        decidedByAdvertiserUserId: decision.advertiserUserId ?? null,
        decidedByAdminUserId: decision.adminUserId ?? null,
        conversionId,
      })
      .where(eq(claims.id, claimId));
    await emitWebhook(tx, row.campaign.orgId, 'claim.decided', { claim_id: claimId, status: decision.approve ? 'approved' : 'rejected', note: note || null, conversion_id: conversionId }, now);
    await tx.insert(auditLog).values({
      id: newId('audit'),
      adminUserId: decision.adminUserId ?? null,
      action: decision.approve ? 'claim.approve' : 'claim.reject',
      entityType: 'claim',
      entityId: claimId,
      details: { note, conversionId, advertiserUserId: decision.advertiserUserId ?? null },
    });
    return { ok: true } as const;
  });
}

type ClaimRow = { claim: typeof claims.$inferSelect; campaign: typeof campaigns.$inferSelect; click: typeof clicks.$inferSelect; placement: typeof placements.$inferSelect };

/** Bills and rewards an approved claim; returns the conversion id or why it cannot be approved. */
async function creditClaim(tx: Tx, { claim, campaign, click, placement }: ClaimRow, now: Date): Promise<string | Extract<DecideResult, { ok: false }>> {
  const existing = await tx.query.conversions.findFirst({ where: and(eq(conversions.clickId, click.id), eq(conversions.taskId, claim.taskId)) });
  if (existing?.status === 'approved') return existing.id; // rewarded meanwhile: nothing more to bill
  if (existing?.status === 'reversed') return { ok: false, reason: 'claim_reversed' };

  const price = await priceFor(tx, claim.taskId, click.country);
  if (price === null) return { ok: false, reason: 'claim_no_price' };
  const advertiserAccount = await getAccountId(tx, 'advertiser_balance', campaign.orgId);
  await lockAccount(tx, advertiserAccount);
  if ((await creditPosition(tx, campaign.orgId, now)).spendable < price) return { ok: false, reason: 'claim_balance' };

  const publisherPayout = applyBps(price, placement.revshareBps);
  const values = {
    status: 'approved' as const,
    advertiserPrice: price,
    publisherPayout,
    userRewardPoints: toPoints(publisherPayout, placement.pointsPerUsd),
  };
  let conversionId: string;
  if (existing) {
    conversionId = existing.id;
    await tx.update(conversions).set({ ...values, reasons: [...existing.reasons, 'claim_approved'] }).where(eq(conversions.id, existing.id));
  } else {
    conversionId = newId('conversion');
    await tx.insert(conversions).values({
      id: conversionId,
      clickId: click.id,
      taskId: claim.taskId,
      campaignId: campaign.id,
      placementId: placement.id,
      publisherUserId: claim.publisherUserId,
      reasons: ['claim_approved'],
      eventAt: now,
      createdAt: now,
      ...values,
    });
  }
  await creditConversion(tx, { conversionId, advertiserAccount, publisherOrgId: placement.publisherOrgId, advertiserPrice: price, publisherPayout });
  await enqueuePublisherPostback(tx, conversionId, 'credit', now);
  await emitWebhook(tx, campaign.orgId, 'conversion.approved', await conversionEventData(tx, conversionId), now);
  return conversionId;
}

/** Claims on an advertiser's campaigns (or all, for Kiqro staff), with what deciding them needs. */
export async function listClaims(db: Db, opts: { orgId?: string; status?: ClaimStatus; limit?: number } = {}) {
  const where = [opts.orgId ? eq(campaigns.orgId, opts.orgId) : undefined, opts.status ? eq(claims.status, opts.status) : undefined].filter(Boolean);
  return db
    .select({
      id: claims.id,
      status: claims.status,
      publisherUserId: claims.publisherUserId,
      userNote: claims.userNote,
      decisionNote: claims.decisionNote,
      createdAt: claims.createdAt,
      decidedAt: claims.decidedAt,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      orgId: campaigns.orgId,
      taskName: campaignTasks.displayName,
      taskEvent: campaignTasks.mmpEventName,
      clickId: clicks.id,
      clickedAt: clicks.createdAt,
      country: clicks.country,
      placementName: placements.name,
    })
    .from(claims)
    .innerJoin(campaigns, eq(campaigns.id, claims.campaignId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, claims.taskId))
    .innerJoin(clicks, eq(clicks.id, claims.clickId))
    .innerJoin(placements, eq(placements.id, claims.placementId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(claims.createdAt))
    .limit(opts.limit ?? 200);
}

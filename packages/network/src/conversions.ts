import { and, eq, inArray, ne } from 'drizzle-orm';
import { applyBps, verify, toPoints } from '@kiqro/core';
import { getAccountId, getBalance, lockAccount, newId, postTransaction, schema, type Db, type Tx } from '@kiqro/db';
import { priceFor } from './campaigns.ts';
import { enqueuePublisherPostback } from './outbox.ts';

const { campaignTasks, campaigns, clicks, conversions, organizations, placements, postbacksRaw } = schema;

const DAY_MS = 86_400_000;
const INSTALL_EVENT = 'install';

export interface PostbackInput {
  advertiserKey: string;
  query: Record<string, string | undefined>;
  url: string;
  ip: string | null;
  now?: Date;
}

export type PostbackOutcome =
  | 'approved'
  | 'held'
  | 'rejected'
  | 'duplicate'
  | 'orphan'
  | 'unknown_event'
  | 'invalid_signature'
  | 'unknown_advertiser'
  | 'bad_request';

export interface PostbackResult {
  /** HTTP status for the MMP: 200 for anything we stored, so MMPs do not retry business rejections. */
  httpStatus: 200 | 400 | 403;
  outcome: PostbackOutcome;
  conversionId?: string;
  reasons?: string[];
}

/** Parses "1730000000", "1730000000000" or an ISO date; falls back to `fallback`. */
function parseEventTime(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/**
 * Handles an install or in-app event postback from an MMP (or an advertiser S2S call).
 * The raw request is stored first; the conversion, ledger posting and publisher postback
 * are then written in one database transaction.
 */
export async function handlePostback(db: Db, input: PostbackInput): Promise<PostbackResult> {
  const now = input.now ?? new Date();
  const rawId = newId('postback');
  await db.insert(postbacksRaw).values({ id: rawId, source: 'mmp', url: input.url, ip: input.ip, receivedAt: now });

  const result = await evaluatePostback(db, input, rawId, now);
  await db.update(postbacksRaw).set({ outcome: result.outcome }).where(eq(postbacksRaw.id, rawId));
  return result;
}

async function evaluatePostback(db: Db, input: PostbackInput, rawId: string, now: Date): Promise<PostbackResult> {
  const clickId = input.query.click_id;
  const eventName = input.query.event;
  if (!clickId || !eventName) return { httpStatus: 400, outcome: 'bad_request' };

  const advertiser = await db.query.organizations.findFirst({ where: eq(organizations.postbackKey, input.advertiserKey) });
  if (!advertiser || advertiser.type !== 'advertiser') return { httpStatus: 403, outcome: 'unknown_advertiser' };
  if (advertiser.postbackSecret && !verify(advertiser.postbackSecret, [clickId, eventName], input.query.sig)) {
    return { httpStatus: 403, outcome: 'invalid_signature' };
  }

  const click = await db.query.clicks.findFirst({ where: eq(clicks.id, clickId) });
  const campaign = click && (await db.query.campaigns.findFirst({ where: eq(campaigns.id, click.campaignId) }));
  if (!click || !campaign || campaign.orgId !== advertiser.id) return { httpStatus: 200, outcome: 'orphan' };

  const task = await db.query.campaignTasks.findFirst({
    where: and(eq(campaignTasks.campaignId, campaign.id), eq(campaignTasks.mmpEventName, eventName)),
  });
  if (!task) return { httpStatus: 200, outcome: 'unknown_event' };

  const eventAt = parseEventTime(input.query.event_ts ?? input.query.install_ts, now);

  return db.transaction(async (tx) => {
    const existing = await tx.query.conversions.findFirst({ where: and(eq(conversions.clickId, click.id), eq(conversions.taskId, task.id)) });
    if (existing) return { httpStatus: 200, outcome: 'duplicate', conversionId: existing.id } as const;

    const placement = (await tx.query.placements.findFirst({ where: eq(placements.id, click.placementId) }))!;
    const rejectReasons: string[] = [];
    const holdReasons: string[] = [];

    if (task.mmpEventName === INSTALL_EVENT) {
      const ctitSeconds = (eventAt.getTime() - click.createdAt.getTime()) / 1000;
      if (ctitSeconds < campaign.ctitMinSeconds) rejectReasons.push('ctit_too_short');
      if (ctitSeconds > campaign.attributionWindowDays * 86_400) rejectReasons.push('outside_attribution_window');
    } else {
      const anchor = await installTimeFor(tx, click.id, campaign.id, click.createdAt);
      if (!anchor) rejectReasons.push('install_not_attributed');
      else if (eventAt.getTime() - anchor.getTime() > task.timeLimitDays * DAY_MS) rejectReasons.push('task_time_limit_exceeded');
    }

    // One reward per publisher user and task, even across separate clicks.
    const sameUser = await tx.query.conversions.findFirst({
      where: and(
        eq(conversions.placementId, placement.id),
        eq(conversions.publisherUserId, click.publisherUserId),
        eq(conversions.taskId, task.id),
        inArray(conversions.status, ['approved', 'held']),
        ne(conversions.clickId, click.id),
      ),
    });
    if (sameUser) rejectReasons.push('duplicate_user');

    const reportedCountry = input.query.country?.toUpperCase();
    if (reportedCountry && click.country && reportedCountry !== click.country) holdReasons.push('country_mismatch');

    const price = await priceFor(tx, task.id, click.country);
    if (price === null) rejectReasons.push('no_price');

    const advertiserAccount = await getAccountId(tx, 'advertiser_balance', advertiser.id);
    if (rejectReasons.length === 0 && holdReasons.length === 0) {
      await lockAccount(tx, advertiserAccount);
      if ((await getBalance(tx, advertiserAccount)) < price!) holdReasons.push('insufficient_balance');
    }

    const status = rejectReasons.length > 0 ? 'rejected' : holdReasons.length > 0 ? 'held' : 'approved';
    const advertiserPrice = price ?? 0n;
    const publisherPayout = applyBps(advertiserPrice, placement.revshareBps);
    const conversionId = newId('conversion');
    await tx.insert(conversions).values({
      id: conversionId,
      clickId: click.id,
      taskId: task.id,
      campaignId: campaign.id,
      placementId: placement.id,
      publisherUserId: click.publisherUserId,
      status,
      reasons: [...rejectReasons, ...holdReasons],
      advertiserPrice,
      publisherPayout,
      userRewardPoints: toPoints(publisherPayout, placement.pointsPerUsd),
      eventAt,
      postbackRawId: rawId,
      createdAt: now,
    });

    if (status === 'approved') {
      await creditConversion(tx, { conversionId, advertiserAccount, publisherOrgId: placement.publisherOrgId, advertiserPrice, publisherPayout });
      await enqueuePublisherPostback(tx, conversionId, 'credit', now);
    }
    return { httpStatus: 200, outcome: status, conversionId, reasons: [...rejectReasons, ...holdReasons] } as const;
  });
}

/** Install time of the click if the campaign has an install task, otherwise the click time. */
async function installTimeFor(tx: Tx, clickId: string, campaignId: string, clickTime: Date): Promise<Date | null> {
  const installTask = await tx.query.campaignTasks.findFirst({
    where: and(eq(campaignTasks.campaignId, campaignId), eq(campaignTasks.mmpEventName, INSTALL_EVENT)),
  });
  if (!installTask) return clickTime;
  const install = await tx.query.conversions.findFirst({
    where: and(eq(conversions.clickId, clickId), eq(conversions.taskId, installTask.id), eq(conversions.status, 'approved')),
  });
  return install?.eventAt ?? null;
}

/** Moves the advertiser price into publisher payable and Kiqro revenue for one conversion. */
export async function creditConversion(
  tx: Tx,
  c: { conversionId: string; advertiserAccount: string; publisherOrgId: string; advertiserPrice: bigint; publisherPayout: bigint },
): Promise<void> {
  await postTransaction(tx, {
    type: 'conversion',
    refType: 'conversion',
    refId: c.conversionId,
    entries: [
      { accountId: c.advertiserAccount, amount: -c.advertiserPrice },
      { accountId: await getAccountId(tx, 'publisher_payable', c.publisherOrgId), amount: c.publisherPayout },
      { accountId: await getAccountId(tx, 'kiqro_revenue', null), amount: c.advertiserPrice - c.publisherPayout },
    ],
  });
}

export interface ReversalInput {
  advertiserKey: string;
  clickId: string;
  eventName: string;
  reason: string;
  now?: Date;
}

export type ReversalResult =
  | { ok: true; conversionId: string }
  | { ok: false; reason: 'unknown_advertiser' | 'not_found' | 'not_approved' | 'outside_reversal_window' };

/**
 * Reverses an approved conversion (advertiser or MMP fraud finding). Rewards were paid
 * instantly, so this is a chargeback: the advertiser is refunded, the publisher payable is
 * debited and the publisher receives a status=2 postback to take the reward back.
 */
export async function reverseConversion(db: Db, input: ReversalInput): Promise<ReversalResult> {
  const now = input.now ?? new Date();
  const advertiser = await db.query.organizations.findFirst({ where: eq(organizations.postbackKey, input.advertiserKey) });
  if (!advertiser) return { ok: false, reason: 'unknown_advertiser' };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ conversion: conversions, task: campaignTasks })
      .from(conversions)
      .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
      .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
      .where(and(eq(conversions.clickId, input.clickId), eq(campaignTasks.mmpEventName, input.eventName), eq(campaigns.orgId, advertiser.id)))
      .for('update', { of: conversions });
    if (!row) return { ok: false, reason: 'not_found' } as const;
    const { conversion } = row;
    if (conversion.status !== 'approved') return { ok: false, reason: 'not_approved' } as const;
    if (now.getTime() - conversion.createdAt.getTime() > advertiser.reversalWindowDays * DAY_MS) {
      return { ok: false, reason: 'outside_reversal_window' } as const;
    }

    const placement = (await tx.query.placements.findFirst({ where: eq(placements.id, conversion.placementId) }))!;
    await postTransaction(tx, {
      type: 'conversion_reversal',
      refType: 'conversion',
      refId: conversion.id,
      memo: input.reason,
      entries: [
        { accountId: await getAccountId(tx, 'advertiser_balance', advertiser.id), amount: conversion.advertiserPrice },
        { accountId: await getAccountId(tx, 'publisher_payable', placement.publisherOrgId), amount: -conversion.publisherPayout },
        { accountId: await getAccountId(tx, 'kiqro_revenue', null), amount: -(conversion.advertiserPrice - conversion.publisherPayout) },
      ],
    });
    await tx
      .update(conversions)
      .set({ status: 'reversed', reversedAt: now, reversalReason: input.reason.slice(0, 200) })
      .where(eq(conversions.id, conversion.id));
    await enqueuePublisherPostback(tx, conversion.id, 'reversal', now);
    return { ok: true, conversionId: conversion.id } as const;
  });
}

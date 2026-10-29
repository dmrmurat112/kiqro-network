import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { fillMacros, formatMicros, sign } from '@kiqro/core';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';

const { campaignTasks, campaigns, clicks, conversions, placements, publisherPostbacks } = schema;

export const MAX_ATTEMPTS = 10;
const REQUEST_TIMEOUT_MS = 10_000;
/** How long a claimed row stays hidden from other workers; must exceed a batch's delivery time. */
const LEASE_MS = 15 * 60_000;

/** Backoff after the n-th failed attempt: 1, 2, 4 … minutes, capped at 6 hours. */
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** (attempts - 1) * 60_000, 6 * 3_600_000);
}

/**
 * Builds the publisher postback URL for a conversion and queues it. Does nothing when the
 * placement has no postback URL. Signature: HMAC(secret, user_id|amount|transaction_id|status).
 */
export async function enqueuePublisherPostback(db: DbOrTx, conversionId: string, kind: 'credit' | 'reversal', now: Date): Promise<void> {
  const [row] = await db
    .select({ conversion: conversions, placement: placements, campaign: campaigns, task: campaignTasks, click: clicks })
    .from(conversions)
    .innerJoin(placements, eq(placements.id, conversions.placementId))
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .innerJoin(clicks, eq(clicks.id, conversions.clickId))
    .where(eq(conversions.id, conversionId));
  const template = row?.placement.postbackUrl;
  if (!row || !template) return;

  const { conversion, placement, campaign, task, click } = row;
  const status = kind === 'credit' ? 1 : 2;
  const amount = conversion.userRewardPoints.toString();
  const url = fillMacros(template, {
    user_id: conversion.publisherUserId,
    amount,
    payout_usd: formatMicros(conversion.publisherPayout),
    transaction_id: conversion.id,
    offer_id: campaign.id,
    offer_name: campaign.title.en ?? Object.values(campaign.title)[0],
    task_name: task.displayName.en ?? Object.values(task.displayName)[0],
    status,
    country: click.country,
    signature: sign(placement.secret, [conversion.publisherUserId, amount, conversion.id, status]),
  });
  await db.insert(publisherPostbacks).values({ id: newId('outbox'), conversionId, kind, url, nextAttemptAt: now }).onConflictDoNothing();
}

export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/**
 * Delivers due publisher postbacks. Rows are first leased (claimed with SKIP LOCKED and
 * pushed forward by LEASE_MS) in a short transaction, so HTTP calls run outside any
 * transaction and several workers can run side by side. Returns how many were attempted.
 */
export async function deliverDuePostbacks(db: Db, fetcher: Fetcher = fetch, now = new Date(), batchSize = 50): Promise<number> {
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(publisherPostbacks)
      .where(and(eq(publisherPostbacks.status, 'pending'), lte(publisherPostbacks.nextAttemptAt, now)))
      .orderBy(asc(publisherPostbacks.nextAttemptAt))
      .limit(batchSize)
      .for('update', { skipLocked: true });
    if (rows.length > 0) {
      await tx
        .update(publisherPostbacks)
        .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
        .where(inArray(publisherPostbacks.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  for (const item of due) {
    let error: string | null = null;
    try {
      const res = await fetcher(item.url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const attempts = item.attempts + 1;
    if (error === null) {
      await db.update(publisherPostbacks).set({ status: 'sent', attempts, sentAt: now, lastError: null }).where(eq(publisherPostbacks.id, item.id));
    } else {
      await db
        .update(publisherPostbacks)
        .set({
          attempts,
          lastError: error.slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
        })
        .where(eq(publisherPostbacks.id, item.id));
    }
  }
  return due.length;
}

/** Puts a failed postback back in the queue (admin "resend"). */
export async function retryFailedPostback(db: DbOrTx, id: string, now = new Date()): Promise<void> {
  await db
    .update(publisherPostbacks)
    .set({ status: 'pending', nextAttemptAt: now, attempts: sql`0` })
    .where(and(eq(publisherPostbacks.id, id), eq(publisherPostbacks.status, 'failed')));
}

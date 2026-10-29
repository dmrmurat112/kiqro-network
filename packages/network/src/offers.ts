import { and, asc, eq, inArray } from 'drizzle-orm';
import { applyBps, formatMicros, sign, toPoints, verify } from '@kiqro/core';
import { schema, type Db } from '@kiqro/db';
import { acceptsNewUsers, priceFor } from './campaigns.ts';
import { parseRisk, signedParts } from './clicks.ts';

const { campaignTasks, campaigns, clicks, conversions, placements, products } = schema;

export interface OffersInput {
  appKey: string;
  publisherUserId: string;
  signature: string | undefined;
  country: string | null;
  lang: string;
  trackingBaseUrl: string;
  /** Optional publisher risk score for the user; signed and carried into every click URL. */
  publisherRisk?: string;
  now?: Date;
}

/** Progress of one step for this user: not done yet, rewarded, held for review, or not rewarded. */
export type TaskState = 'open' | 'credited' | 'in_review' | 'rejected' | 'reversed';

export interface OfferTask {
  seq: number;
  name: string;
  timeLimitDays: number;
  /** The publisher's share in USD (for the publisher's own accounting; do not show to users). */
  payoutUsd: string;
  /** Reward for the user in the publisher's currency, from the placement's exchange rate. */
  rewardPoints: string;
  state: TaskState;
}

export interface Offer {
  offerId: string;
  title: string;
  description: string;
  platform: string;
  iconUrl: string | null;
  clickUrl: string;
  totalRewardPoints: string;
  /** True once the user has clicked the offer; started offers stay listed until their time runs out. */
  started: boolean;
  /** Every step credited. */
  completed: boolean;
  tasks: OfferTask[];
}

const pick = (text: Record<string, string>, lang: string) => text[lang] ?? text.en ?? Object.values(text)[0] ?? '';
const DAY_MS = 86_400_000;
const STATE: Record<string, TaskState> = { approved: 'credited', held: 'in_review', rejected: 'rejected', reversed: 'reversed' };

/**
 * Offers API: campaigns available to one publisher user, with rewards already converted to
 * the publisher's currency, the user's progress per step, and a signed click URL per offer.
 * Offers the user already started stay listed (even if the campaign stopped taking new users)
 * until the last step's time limit has passed, priced for the country of their first click.
 * This is how the Kiqro app (and later other publishers) list Kiqro Direct offers.
 */
export async function listOffers(db: Db, input: OffersInput): Promise<{ ok: true; offers: Offer[] } | { ok: false; status: 403 | 404; reason: string }> {
  const now = input.now ?? new Date();
  const placement = await db.query.placements.findFirst({ where: eq(placements.appKey, input.appKey) });
  if (!placement || placement.status !== 'active') return { ok: false, status: 404, reason: 'unknown_placement' };
  if (!verify(placement.secret, signedParts(input.appKey, input.publisherUserId, input.publisherRisk), input.signature)) {
    return { ok: false, status: 403, reason: 'invalid_signature' };
  }
  if (Number.isNaN(parseRisk(input.publisherRisk))) return { ok: false, status: 403, reason: 'invalid_risk' };

  // What this user already did on this placement.
  const userClicks = await db
    .select({ campaignId: clicks.campaignId, country: clicks.country, createdAt: clicks.createdAt })
    .from(clicks)
    .where(and(eq(clicks.placementId, placement.id), eq(clicks.publisherUserId, input.publisherUserId)))
    .orderBy(asc(clicks.createdAt));
  const firstClick = new Map<string, { country: string | null; at: Date }>();
  for (const c of userClicks) if (!firstClick.has(c.campaignId)) firstClick.set(c.campaignId, { country: c.country, at: c.createdAt });
  const userConversions = await db
    .select({ taskId: conversions.taskId, status: conversions.status })
    .from(conversions)
    .where(and(eq(conversions.placementId, placement.id), eq(conversions.publisherUserId, input.publisherUserId)));

  const candidates = await db.select().from(campaigns).where(inArray(campaigns.status, ['active', 'paused']));
  const candidateTasks = candidates.length
    ? await db.select().from(campaignTasks).where(inArray(campaignTasks.campaignId, candidates.map((c) => c.id))).orderBy(asc(campaignTasks.seq))
    : [];

  const available: { campaign: (typeof candidates)[number]; started: boolean; country: string | null }[] = [];
  for (const campaign of candidates) {
    const start = firstClick.get(campaign.id);
    const longest = Math.max(0, ...candidateTasks.filter((t) => t.campaignId === campaign.id).map((t) => t.timeLimitDays));
    const stillRunning = start && now.getTime() - start.at.getTime() <= (campaign.attributionWindowDays + longest) * DAY_MS;
    if (stillRunning) available.push({ campaign, started: true, country: start.country });
    else if ((await acceptsNewUsers(db, campaign, input.country, now)) === null) available.push({ campaign, started: false, country: input.country });
  }
  if (available.length === 0) return { ok: true, offers: [] };

  const productRows = await db.select().from(products).where(inArray(products.id, available.map((a) => a.campaign.productId)));

  const offers: Offer[] = [];
  for (const { campaign, started, country } of available) {
    const product = productRows.find((p) => p.id === campaign.productId)!;
    const tasks: OfferTask[] = [];
    let total = 0n;
    for (const task of candidateTasks.filter((t) => t.campaignId === campaign.id)) {
      const price = await priceFor(db, task.id, country);
      if (price === null) continue;
      const payout = applyBps(price, placement.revshareBps);
      const points = toPoints(payout, placement.pointsPerUsd);
      total += points;
      const done = userConversions.find((c) => c.taskId === task.id);
      tasks.push({
        seq: task.seq,
        name: pick(task.displayName, input.lang),
        timeLimitDays: task.timeLimitDays,
        payoutUsd: formatMicros(payout),
        rewardPoints: points.toString(),
        state: done ? STATE[done.status]! : 'open',
      });
    }
    if (tasks.length === 0) continue;

    const clickParams = new URLSearchParams({ app_key: placement.appKey, uid: input.publisherUserId });
    if (input.publisherRisk !== undefined) clickParams.set('risk', input.publisherRisk);
    clickParams.set('sig', sign(placement.secret, signedParts(campaign.id, input.publisherUserId, input.publisherRisk)));
    offers.push({
      offerId: campaign.id,
      title: pick(campaign.title, input.lang),
      description: pick(campaign.description, input.lang),
      platform: product.platform,
      iconUrl: product.iconUrl,
      clickUrl: `${input.trackingBaseUrl}/c/${campaign.id}?${clickParams}`,
      totalRewardPoints: total.toString(),
      started,
      completed: tasks.every((t) => t.state === 'credited'),
      tasks,
    });
  }
  // Offers in progress first, then the most rewarding.
  offers.sort((a, b) => Number(b.started) - Number(a.started) || Number(BigInt(b.totalRewardPoints) - BigInt(a.totalRewardPoints)));
  return { ok: true, offers };
}

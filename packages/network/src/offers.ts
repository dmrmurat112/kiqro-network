import { asc, eq, inArray } from 'drizzle-orm';
import { applyBps, formatMicros, sign, toPoints, verify } from '@kiqro/core';
import { schema, type Db } from '@kiqro/db';
import { acceptsNewUsers, priceFor } from './campaigns.ts';
import { parseRisk, signedParts } from './clicks.ts';

const { campaignTasks, campaigns, placements, products } = schema;

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

export interface OfferTask {
  seq: number;
  name: string;
  timeLimitDays: number;
  payoutUsd: string;
  rewardPoints: string;
}

export interface Offer {
  offerId: string;
  title: string;
  description: string;
  platform: string;
  iconUrl: string | null;
  clickUrl: string;
  totalRewardPoints: string;
  tasks: OfferTask[];
}

const pick = (text: Record<string, string>, lang: string) => text[lang] ?? text.en ?? Object.values(text)[0] ?? '';

/**
 * Offers API: active campaigns available to one publisher user, with rewards already
 * converted to the publisher's currency and a signed click URL per offer. This is how the
 * Kiqro app (and later other publishers) list Kiqro Direct offers.
 */
export async function listOffers(db: Db, input: OffersInput): Promise<{ ok: true; offers: Offer[] } | { ok: false; status: 403 | 404; reason: string }> {
  const now = input.now ?? new Date();
  const placement = await db.query.placements.findFirst({ where: eq(placements.appKey, input.appKey) });
  if (!placement || placement.status !== 'active') return { ok: false, status: 404, reason: 'unknown_placement' };
  if (!verify(placement.secret, signedParts(input.appKey, input.publisherUserId, input.publisherRisk), input.signature)) {
    return { ok: false, status: 403, reason: 'invalid_signature' };
  }
  if (Number.isNaN(parseRisk(input.publisherRisk))) return { ok: false, status: 403, reason: 'invalid_risk' };

  const active = await db.select().from(campaigns).where(eq(campaigns.status, 'active'));
  const available = [];
  for (const campaign of active) {
    if ((await acceptsNewUsers(db, campaign, input.country, now)) === null) available.push(campaign);
  }
  if (available.length === 0) return { ok: true, offers: [] };

  const productRows = await db.select().from(products).where(inArray(products.id, available.map((c) => c.productId)));
  const taskRows = await db
    .select()
    .from(campaignTasks)
    .where(inArray(campaignTasks.campaignId, available.map((c) => c.id)))
    .orderBy(asc(campaignTasks.seq));

  const offers: Offer[] = [];
  for (const campaign of available) {
    const product = productRows.find((p) => p.id === campaign.productId)!;
    const tasks: OfferTask[] = [];
    let total = 0n;
    for (const task of taskRows.filter((t) => t.campaignId === campaign.id)) {
      const price = await priceFor(db, task.id, input.country);
      if (price === null) continue;
      const payout = applyBps(price, placement.revshareBps);
      const points = toPoints(payout, placement.pointsPerUsd);
      total += points;
      tasks.push({ seq: task.seq, name: pick(task.displayName, input.lang), timeLimitDays: task.timeLimitDays, payoutUsd: formatMicros(payout), rewardPoints: points.toString() });
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
      tasks,
    });
  }
  return { ok: true, offers };
}

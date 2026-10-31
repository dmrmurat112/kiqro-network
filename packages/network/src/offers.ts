import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { applyBps, formatMicros, sign, toPoints, verify } from '@kiqro/core';
import { schema, type Db } from '@kiqro/db';
import { acceptsNewUsers, priceFor } from './campaigns.ts';
import { parseRisk, signedParts } from './clicks.ts';
import { activeSale, isUserBanned, multiplyPoints, saleMultiplierAt } from './publisher/tools.ts';

const { campaignTasks, campaigns, clicks, conversions, placements, products } = schema;

/** Ranking looks at the last two weeks of clicks and billed conversions, across all placements. */
const RANK_WINDOW_MS = 14 * 86_400_000;
/** Clicks' worth of weight given to the prior, so new campaigns get a fair first chance. */
const PRIOR_CLICKS = 50;
/** Prior completion assumption: 5% of an offer's total price is earned per click. */
const PRIOR_EPC_SHARE = 0.05;

/**
 * Expected earnings per click (micro-USD, advertiser price) per campaign: observed billed
 * revenue per click, smoothed towards a prior from the offer's own prices so a campaign with
 * few clicks is neither buried nor promoted on noise.
 */
async function earningsPerClick(db: Db, campaignIds: string[], offerPrice: Map<string, bigint>, now: Date): Promise<Map<string, number>> {
  if (!campaignIds.length) return new Map();
  const since = new Date(now.getTime() - RANK_WINDOW_MS);
  const [clickRows, revenueRows] = await Promise.all([
    db
      .select({ campaignId: clicks.campaignId, n: sql<string>`count(*)` })
      .from(clicks)
      .where(and(inArray(clicks.campaignId, campaignIds), gte(clicks.createdAt, since)))
      .groupBy(clicks.campaignId),
    db
      .select({ campaignId: conversions.campaignId, total: sql<string>`coalesce(sum(${conversions.advertiserPrice}), 0)` })
      .from(conversions)
      .where(and(inArray(conversions.campaignId, campaignIds), eq(conversions.status, 'approved'), gte(conversions.createdAt, since)))
      .groupBy(conversions.campaignId),
  ]);
  const scores = new Map<string, number>();
  for (const id of campaignIds) {
    const n = Number(clickRows.find((r) => r.campaignId === id)?.n ?? 0);
    const earned = Number(revenueRows.find((r) => r.campaignId === id)?.total ?? 0);
    const prior = Number(offerPrice.get(id) ?? 0n) * PRIOR_EPC_SHARE;
    scores.set(id, (earned + PRIOR_CLICKS * prior) / (n + PRIOR_CLICKS));
  }
  return scores;
}

export interface OffersInput {
  appKey: string;
  publisherUserId: string;
  signature: string | undefined;
  country: string | null;
  lang: string;
  trackingBaseUrl: string;
  /** Optional publisher risk score for the user; signed and carried into every click URL. */
  publisherRisk?: string;
  /** Only offers for these platforms (android, ios, web); all when empty. */
  platforms?: string[];
  /** Only offers in these categories; all when empty. */
  categories?: string[];
  /** Publisher's own values (custom_1..custom_5), carried in click URLs and returned in its postbacks. */
  custom?: Record<string, string>;
  now?: Date;
}

/** Offer categories advertisers choose from (offerwall filters, `category` in the Offers API). */
export const OFFER_CATEGORIES = ['games', 'finance', 'shopping', 'entertainment', 'lifestyle', 'utilities', 'other'] as const;

/** Progress of one step for this user: not done yet, rewarded, held for review, or not rewarded. */
export type TaskState = 'open' | 'credited' | 'in_review' | 'rejected' | 'reversed';

export interface OfferTask {
  /** Identifies the step in missing-credit claims (POST /v1/claims). */
  taskId: string;
  seq: number;
  name: string;
  timeLimitDays: number;
  /** The publisher's share in USD (for the publisher's own accounting; do not show to users). */
  payoutUsd: string;
  /** Reward for the user in the publisher's currency, from the placement's exchange rate. */
  rewardPoints: string;
  state: TaskState;
}

/** Placement details the hosted offerwall shows. */
export interface PlacementInfo {
  currencyName: string;
  publisherName: string;
  /** Currency sale running now: rewards of offers clicked until endsAt are multiplied. */
  sale: { multiplier: number; endsAt: string } | null;
  /** Hosted offerwall branding chosen by the publisher (null = Kiqro defaults). */
  brandColor: string | null;
  logoUrl: string | null;
  wallTitle: string | null;
}

export interface Offer {
  offerId: string;
  title: string;
  description: string;
  platform: string;
  iconUrl: string | null;
  /** Wide banner of the app, when the advertiser added one. */
  coverUrl: string | null;
  /** Store screenshots (https). */
  screenshots: string[];
  /** One of OFFER_CATEGORIES. */
  category: string;
  /** Step-by-step instructions for the user in the requested language (may be empty). */
  instructions: string;
  /** Campaign went live in the last 14 days. */
  isNew: boolean;
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
export async function listOffers(db: Db, input: OffersInput): Promise<{ ok: true; offers: Offer[]; placement: PlacementInfo } | { ok: false; status: 403 | 404; reason: string }> {
  const now = input.now ?? new Date();
  const placement = await db.query.placements.findFirst({ where: eq(placements.appKey, input.appKey) });
  if (!placement || placement.status !== 'active') return { ok: false, status: 404, reason: 'unknown_placement' };
  if (!verify(placement.secret, signedParts(input.appKey, input.publisherUserId, input.publisherRisk), input.signature)) {
    return { ok: false, status: 403, reason: 'invalid_signature' };
  }
  if (Number.isNaN(parseRisk(input.publisherRisk))) return { ok: false, status: 403, reason: 'invalid_risk' };
  const sale = await activeSale(db, placement.id, now);

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
  const info: PlacementInfo = {
    currencyName: placement.currencyName,
    publisherName: (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, placement.publisherOrgId), columns: { name: true } }))?.name ?? '',
    brandColor: placement.brandColor,
    logoUrl: placement.logoUrl,
    wallTitle: placement.wallTitle,
    sale: sale ? { multiplier: sale.multiplierBps / 10_000, endsAt: sale.endsAt.toISOString() } : null,
  };
  if (await isUserBanned(db, placement.publisherOrgId, input.publisherUserId)) return { ok: true, offers: [], placement: info };
  if (available.length === 0) return { ok: true, offers: [], placement: info };

  const productRows = await db.select().from(products).where(inArray(products.id, available.map((a) => a.campaign.productId)));
  const platforms = input.platforms?.length ? new Set(input.platforms) : null;
  const categories = input.categories?.length ? new Set(input.categories) : null;
  // Points follow the currency sale that runs when the user clicks: now for new offers, the
  // first click for started ones (as credited later by the conversion).
  const nowBps = sale?.multiplierBps ?? 10_000;

  const offers: Offer[] = [];
  const offerPrice = new Map<string, bigint>();
  for (const { campaign, started, country } of available) {
    const product = productRows.find((p) => p.id === campaign.productId)!;
    if (platforms && !platforms.has(product.platform)) continue;
    if (categories && !categories.has(campaign.category)) continue;
    const first = firstClick.get(campaign.id);
    const bps = started && first ? await saleMultiplierAt(db, placement.id, first.at) : nowBps;
    const tasks: OfferTask[] = [];
    let total = 0n;
    for (const task of candidateTasks.filter((t) => t.campaignId === campaign.id)) {
      const price = await priceFor(db, task.id, country);
      if (price === null) continue;
      const payout = applyBps(price, placement.revshareBps);
      const base = toPoints(payout, placement.pointsPerUsd);
      const points = multiplyPoints(base, bps);
      total += points;
      offerPrice.set(campaign.id, (offerPrice.get(campaign.id) ?? 0n) + price);
      const done = userConversions.find((c) => c.taskId === task.id);
      tasks.push({
        taskId: task.id,
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
    for (const [k, v] of Object.entries(input.custom ?? {})) clickParams.set(k, v);
    clickParams.set('sig', sign(placement.secret, signedParts(campaign.id, input.publisherUserId, input.publisherRisk)));
    offers.push({
      offerId: campaign.id,
      title: pick(campaign.title, input.lang),
      description: pick(campaign.description, input.lang),
      platform: product.platform,
      iconUrl: product.iconUrl,
      coverUrl: product.coverUrl,
      screenshots: product.screenshots,
      category: campaign.category,
      instructions: pick(campaign.instructions, input.lang),
      isNew: now.getTime() - (campaign.reviewedAt ?? campaign.createdAt).getTime() <= 14 * DAY_MS,
      clickUrl: `${input.trackingBaseUrl}/c/${campaign.id}?${clickParams}`,
      totalRewardPoints: total.toString(),
      started,
      completed: tasks.every((t) => t.state === 'credited'),
      tasks,
    });
  }
  // Offers in progress first, then those expected to earn the most per click (best for the
  // publisher and its users), then the most rewarding.
  const epc = await earningsPerClick(db, offers.map((o) => o.offerId), offerPrice, now);
  offers.sort(
    (a, b) =>
      Number(b.started) - Number(a.started) ||
      (epc.get(b.offerId) ?? 0) - (epc.get(a.offerId) ?? 0) ||
      Number(BigInt(b.totalRewardPoints) - BigInt(a.totalRewardPoints)),
  );
  return { ok: true, offers, placement: info };
}

const PLATFORMS = ['android', 'ios', 'web'];
const list = (v: string | undefined, allowed: readonly string[]) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => allowed.includes(x));

/**
 * Optional Offers API / offerwall parameters: platform=android,ios · category=games,finance ·
 * custom_1..custom_5 (up to 200 characters each, returned in postbacks).
 */
export function offerQueryOptions(query: Record<string, string | undefined>): Pick<OffersInput, 'platforms' | 'categories' | 'custom'> {
  const custom: Record<string, string> = {};
  for (let n = 1; n <= 5; n++) {
    const value = query[`custom_${n}`];
    if (value) custom[`custom_${n}`] = value.slice(0, 200);
  }
  return { platforms: list(query.platform, PLATFORMS), categories: list(query.category, OFFER_CATEGORIES), custom };
}

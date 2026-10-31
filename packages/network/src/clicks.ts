import { and, desc, eq, gte } from 'drizzle-orm';
import { fillMacros, verify } from '@kiqro/core';
import { newId, schema, type Db } from '@kiqro/db';
import { creditPosition } from './billing/credit.ts';
import { acceptsNewUsers } from './campaigns.ts';
import { defaultFraudContext, screenClick, type FraudContext } from './fraud/rules.ts';
import { isUserBanned } from './publisher/tools.ts';

const { campaigns, clicks, placements } = schema;

const SUB_ID_KEYS = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'] as const;
/** Publisher's own values, returned in its postbacks; never sent to the advertiser. */
const CUSTOM_KEYS = ['custom_1', 'custom_2', 'custom_3', 'custom_4', 'custom_5'] as const;
const DAY_MS = 86_400_000;

export interface ClickInput {
  campaignId: string;
  appKey: string;
  publisherUserId: string;
  signature: string | undefined;
  country: string | null;
  ip: string | null;
  userAgent: string | null;
  query: Record<string, string | undefined>;
  /** Raw `risk` parameter: the publisher's own 0–100 fraud score for this user, if it sends one. */
  publisherRisk?: string;
  fraud?: FraudContext;
  now?: Date;
}

export type ClickResult = { ok: true; clickId: string; redirectUrl: string } | { ok: false; status: 400 | 403 | 404 | 409 | 429; reason: string };

/**
 * Parts covered by the click/offers signature. The optional publisher risk score is signed
 * too, so a user cannot lower it by editing the URL.
 */
export function signedParts(first: string, publisherUserId: string, publisherRisk: string | undefined): string[] {
  return publisherRisk === undefined ? [first, publisherUserId] : [first, publisherUserId, publisherRisk];
}

/** Parses a 0–100 integer risk score: null when absent, NaN when malformed. */
export function parseRisk(value: string | undefined): number | null {
  if (value === undefined) return null;
  return /^\d{1,3}$/.test(value) && Number(value) <= 100 ? Number(value) : NaN;
}

/**
 * Validates a click from a publisher's offerwall, records it and returns the advertiser
 * tracking URL to redirect to. A repeated click by the same user within the attribution
 * window reuses the earlier click id so MMP attribution stays on one record.
 */
export async function handleClick(db: Db, input: ClickInput): Promise<ClickResult> {
  const now = input.now ?? new Date();
  if (!input.publisherUserId) return { ok: false, status: 400, reason: 'missing_user_id' };

  const placement = await db.query.placements.findFirst({ where: eq(placements.appKey, input.appKey) });
  if (!placement || placement.status !== 'active') return { ok: false, status: 404, reason: 'unknown_placement' };
  if (!verify(placement.secret, signedParts(input.campaignId, input.publisherUserId, input.publisherRisk), input.signature)) {
    return { ok: false, status: 403, reason: 'invalid_signature' };
  }
  const publisherRisk = parseRisk(input.publisherRisk);
  if (Number.isNaN(publisherRisk)) return { ok: false, status: 400, reason: 'invalid_risk' };

  if (await isUserBanned(db, placement.publisherOrgId, input.publisherUserId)) return { ok: false, status: 403, reason: 'user_banned' };

  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, input.campaignId) });
  if (!campaign) return { ok: false, status: 404, reason: 'unknown_campaign' };

  const blocked = await acceptsNewUsers(db, campaign, input.country, now);
  if (blocked) return { ok: false, status: 409, reason: blocked };

  if ((await creditPosition(db, campaign.orgId, now)).spendable <= 0n) return { ok: false, status: 409, reason: 'advertiser_balance_empty' };

  const screening = await screenClick(db, input.fraud ?? defaultFraudContext, { ip: input.ip, country: input.country, publisherRisk }, now);
  if (screening.block) return { ok: false, status: screening.block === 'ip_click_velocity' ? 429 : 403, reason: screening.block };

  const windowStart = new Date(now.getTime() - campaign.attributionWindowDays * DAY_MS);
  const previous = await db.query.clicks.findFirst({
    where: and(
      eq(clicks.campaignId, campaign.id),
      eq(clicks.placementId, placement.id),
      eq(clicks.publisherUserId, input.publisherUserId),
      gte(clicks.createdAt, windowStart),
    ),
    orderBy: desc(clicks.createdAt),
  });

  const subIds: Record<string, string> = {};
  for (const key of [...SUB_ID_KEYS, ...CUSTOM_KEYS]) {
    const value = input.query[key];
    if (value) subIds[key] = value.slice(0, 200);
  }

  const clickId = previous?.id ?? newId('click');
  if (!previous) {
    await db.insert(clicks).values({
      id: clickId,
      campaignId: campaign.id,
      placementId: placement.id,
      publisherUserId: input.publisherUserId,
      country: input.country,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      subIds,
      ipRisk: screening.ipRisk,
      publisherRisk,
      createdAt: now,
    });
  }

  const redirectUrl = fillMacros(campaign.trackingUrl, {
    click_id: clickId,
    campaign_id: campaign.id,
    source_id: placement.id,
    sub_source: subIds.sub1,
    country: input.country,
    timestamp: Math.floor(now.getTime() / 1000),
  });
  return { ok: true, clickId, redirectUrl };
}

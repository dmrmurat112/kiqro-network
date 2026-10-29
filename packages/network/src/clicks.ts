import { and, desc, eq, gte } from 'drizzle-orm';
import { fillMacros, verify } from '@kiqro/core';
import { getAccountId, getBalance, newId, schema, type Db } from '@kiqro/db';
import { acceptsNewUsers } from './campaigns.ts';

const { campaigns, clicks, placements } = schema;

const SUB_ID_KEYS = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'] as const;
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
  now?: Date;
}

export type ClickResult = { ok: true; clickId: string; redirectUrl: string } | { ok: false; status: 400 | 403 | 404 | 409; reason: string };

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
  if (!verify(placement.secret, [input.campaignId, input.publisherUserId], input.signature)) {
    return { ok: false, status: 403, reason: 'invalid_signature' };
  }

  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, input.campaignId) });
  if (!campaign) return { ok: false, status: 404, reason: 'unknown_campaign' };

  const blocked = await acceptsNewUsers(db, campaign, input.country, now);
  if (blocked) return { ok: false, status: 409, reason: blocked };

  const advertiserBalance = await getBalance(db, await getAccountId(db, 'advertiser_balance', campaign.orgId));
  if (advertiserBalance <= 0n) return { ok: false, status: 409, reason: 'advertiser_balance_empty' };

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
  for (const key of SUB_ID_KEYS) {
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

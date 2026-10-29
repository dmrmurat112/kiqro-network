import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';

const { campaigns, clicks, conversions, revenueEvents } = schema;
const DAY_MS = 86_400_000;
/** Upper bound for one revenue event; larger values are treated as a macro or unit error. */
const MAX_EVENT_REVENUE_USD = 50_000;

/**
 * Revenue from an MMP postback, in micro-USD: `revenue_usd`, or `revenue` with `currency=USD`.
 * Other currencies are ignored (configure the MMP's USD revenue macro instead).
 */
export function parseRevenue(query: Record<string, string | undefined>): bigint | null {
  const raw = query.revenue_usd ?? (query.currency?.toUpperCase() === 'USD' ? query.revenue : undefined);
  if (!raw || !/^\d+(\.\d+)?$/.test(raw.trim())) return null;
  const value = Number(raw);
  if (!(value > 0) || value > MAX_EVENT_REVENUE_USD) return null;
  return BigInt(Math.round(value * 1e6));
}

/** Stores one revenue event; a repeated MMP event id for the same click is ignored. */
export async function recordRevenue(
  db: DbOrTx,
  input: { clickId: string; campaignId: string; event: string; revenue: bigint; externalId?: string; eventAt: Date; postbackRawId: string },
): Promise<boolean> {
  const inserted = await db
    .insert(revenueEvents)
    .values({ id: newId('revenue'), ...input, externalId: input.externalId?.slice(0, 100) || null })
    .onConflictDoNothing()
    .returning({ id: revenueEvents.id });
  return inserted.length > 0;
}

export interface CampaignRoas {
  campaignId: string;
  spend: bigint;
  /** Revenue within 7 / 30 days of the user's click, and all of it. */
  revenueD7: bigint;
  revenueD30: bigint;
  revenue: bigint;
  payingUsers: number;
  /** revenue / spend; null without spend. */
  roasD7: number | null;
  roasD30: number | null;
  roas: number | null;
}

const ratio = (a: bigint, b: bigint) => (b > 0n ? Number((a * 10_000n) / b) / 10_000 : null);

/**
 * Return on ad spend per campaign: what the advertiser paid Kiqro (approved conversions) against
 * the revenue its MMP reported for the same users, by days since their click.
 */
export async function campaignRoas(db: Db, orgId: string): Promise<CampaignRoas[]> {
  const own = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, orgId));
  if (!own.length) return [];
  const ids = own.map((c) => c.id);
  const spendRows = await db
    .select({ campaignId: conversions.campaignId, spend: sql<string>`coalesce(sum(${conversions.advertiserPrice}), 0)` })
    .from(conversions)
    .where(and(inArray(conversions.campaignId, ids), eq(conversions.status, 'approved')))
    .groupBy(conversions.campaignId);
  const revRows = await db
    .select({
      campaignId: revenueEvents.campaignId,
      total: sql<string>`coalesce(sum(${revenueEvents.revenue}), 0)`,
      d7: sql<string>`coalesce(sum(${revenueEvents.revenue}) filter (where ${revenueEvents.eventAt} < ${clicks.createdAt} + interval '7 days'), 0)`,
      d30: sql<string>`coalesce(sum(${revenueEvents.revenue}) filter (where ${revenueEvents.eventAt} < ${clicks.createdAt} + interval '30 days'), 0)`,
      payers: sql<string>`count(distinct ${clicks.publisherUserId})`,
    })
    .from(revenueEvents)
    .innerJoin(clicks, eq(clicks.id, revenueEvents.clickId))
    .where(inArray(revenueEvents.campaignId, ids))
    .groupBy(revenueEvents.campaignId);

  return ids.map((campaignId) => {
    const spend = BigInt(spendRows.find((r) => r.campaignId === campaignId)?.spend ?? 0);
    const r = revRows.find((x) => x.campaignId === campaignId);
    const revenue = BigInt(r?.total ?? 0);
    const revenueD7 = BigInt(r?.d7 ?? 0);
    const revenueD30 = BigInt(r?.d30 ?? 0);
    return { campaignId, spend, revenue, revenueD7, revenueD30, payingUsers: Number(r?.payers ?? 0), roasD7: ratio(revenueD7, spend), roasD30: ratio(revenueD30, spend), roas: ratio(revenue, spend) };
  });
}

/** Daily revenue (by event day, UTC) for the advertiser's campaigns over the last `days` days. */
export async function dailyRevenue(db: Db, orgId: string, days: number, now = new Date()): Promise<Map<string, bigint>> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS);
  const rows = await db
    .select({ day: sql<string>`to_char(${revenueEvents.eventAt} at time zone 'UTC', 'YYYY-MM-DD')`, total: sql<string>`sum(${revenueEvents.revenue})` })
    .from(revenueEvents)
    .innerJoin(campaigns, eq(campaigns.id, revenueEvents.campaignId))
    .where(and(eq(campaigns.orgId, orgId), gte(revenueEvents.eventAt, start)))
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [r.day, BigInt(r.total)]));
}

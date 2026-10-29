import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { schema, type DbOrTx } from '@kiqro/db';

const { campaigns, conversions, taskPayouts } = schema;

export type Campaign = typeof campaigns.$inferSelect;

/** Advertiser price for a task in a country, falling back to the "*" default price. */
export async function priceFor(db: DbOrTx, taskId: string, country: string | null): Promise<bigint | null> {
  const rows = await db
    .select({ country: taskPayouts.country, price: taskPayouts.price })
    .from(taskPayouts)
    .where(and(eq(taskPayouts.taskId, taskId), inArray(taskPayouts.country, country ? [country, '*'] : ['*'])));
  return (rows.find((r) => r.country === country) ?? rows.find((r) => r.country === '*'))?.price ?? null;
}

/** Sum of approved advertiser spend for a campaign, optionally since a point in time. */
export async function campaignSpend(db: DbOrTx, campaignId: string, since?: Date): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${conversions.advertiserPrice}), 0)` })
    .from(conversions)
    .where(
      and(
        eq(conversions.campaignId, campaignId),
        eq(conversions.status, 'approved'),
        since ? gte(conversions.createdAt, since) : undefined,
      ),
    );
  return BigInt(row!.total);
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Whether the campaign may accept new users right now. Budgets only gate new clicks:
 * users who already started keep being paid for later events (see spec, Bölüm 8 Adım 4).
 */
export async function acceptsNewUsers(db: DbOrTx, campaign: Campaign, country: string | null, now: Date): Promise<string | null> {
  if (campaign.status !== 'active') return 'campaign_not_active';
  if (campaign.startAt && now < campaign.startAt) return 'campaign_not_started';
  if (campaign.endAt && now >= campaign.endAt) return 'campaign_ended';
  if (!country || !campaign.countries.includes(country)) return 'country_not_targeted';
  if ((await campaignSpend(db, campaign.id)) >= campaign.totalBudget) return 'budget_exhausted';
  if (campaign.dailyBudget !== null && (await campaignSpend(db, campaign.id, startOfUtcDay(now))) >= campaign.dailyBudget) {
    return 'daily_budget_exhausted';
  }
  return null;
}

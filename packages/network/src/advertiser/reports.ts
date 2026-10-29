import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getAccountId, getBalance, schema, type Db } from '@kiqro/db';

const { campaignTasks, campaigns, clicks, conversions, products } = schema;

/**
 * Read models for the advertiser panel. Every query is scoped to one organization id, which
 * always comes from the signed-in session, never from the request.
 */

const DAY_MS = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

interface PeriodTotals {
  spend: bigint;
  installs: number;
  events: number;
  /** Conversions Kiqro filtered out (rejected or held for review) and therefore never billed. */
  filtered: number;
}

async function totals(db: Db, orgId: string, from: Date, to: Date): Promise<PeriodTotals> {
  const [row] = await db
    .select({
      spend: sql<string>`coalesce(sum(${conversions.advertiserPrice}) filter (where ${conversions.status} = 'approved'), 0)`,
      installs: sql<string>`count(*) filter (where ${conversions.status} = 'approved' and ${campaignTasks.mmpEventName} = 'install')`,
      events: sql<string>`count(*) filter (where ${conversions.status} = 'approved' and ${campaignTasks.mmpEventName} <> 'install')`,
      filtered: sql<string>`count(*) filter (where ${conversions.status} in ('rejected', 'held'))`,
    })
    .from(conversions)
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .where(and(eq(campaigns.orgId, orgId), gte(conversions.createdAt, from), lt(conversions.createdAt, to)));
  return { spend: BigInt(row!.spend), installs: Number(row!.installs), events: Number(row!.events), filtered: Number(row!.filtered) };
}

export interface Overview {
  current: PeriodTotals;
  previous: PeriodTotals;
  balance: bigint;
  activeCampaigns: number;
  clicks: number;
}

/** Totals for the last `days` days and the same-length period before, for change indicators. */
export async function advertiserOverview(db: Db, orgId: string, days: number, now = new Date()): Promise<Overview> {
  const from = new Date(now.getTime() - days * DAY_MS);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  const [current, previous, balance, [active], [clickRow]] = await Promise.all([
    totals(db, orgId, from, now),
    totals(db, orgId, prevFrom, from),
    getAccountId(db, 'advertiser_balance', orgId).then((id) => getBalance(db, id)),
    db.select({ n: sql<string>`count(*)` }).from(campaigns).where(and(eq(campaigns.orgId, orgId), eq(campaigns.status, 'active'))),
    db
      .select({ n: sql<string>`count(*)` })
      .from(clicks)
      .innerJoin(campaigns, eq(campaigns.id, clicks.campaignId))
      .where(and(eq(campaigns.orgId, orgId), gte(clicks.createdAt, from))),
  ]);
  return { current, previous, balance, activeCampaigns: Number(active!.n), clicks: Number(clickRow!.n) };
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  spend: bigint;
  installs: number;
  events: number;
}

/** One point per UTC day for the last `days` days, including empty days. */
export async function advertiserDailySeries(db: Db, orgId: string, days: number, now = new Date()): Promise<DailyPoint[]> {
  const from = startOfUtcDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${conversions.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      spend: sql<string>`coalesce(sum(${conversions.advertiserPrice}), 0)`,
      installs: sql<string>`count(*) filter (where ${campaignTasks.mmpEventName} = 'install')`,
      events: sql<string>`count(*) filter (where ${campaignTasks.mmpEventName} <> 'install')`,
    })
    .from(conversions)
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .where(and(eq(campaigns.orgId, orgId), eq(conversions.status, 'approved'), gte(conversions.createdAt, from)))
    .groupBy(sql`1`);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    const r = byDay.get(date);
    return { date, spend: BigInt(r?.spend ?? 0), installs: Number(r?.installs ?? 0), events: Number(r?.events ?? 0) };
  });
}

export interface CampaignReport {
  id: string;
  name: string;
  status: string;
  productName: string;
  platform: string;
  countries: string[];
  totalBudget: bigint;
  spend: bigint;
  clicks: number;
  tasks: { seq: number; event: string; name: string; completions: number; spend: bigint }[];
}

/** Lifetime per-campaign funnel: clicks → each task's approved completions and spend. */
export async function advertiserCampaigns(db: Db, orgId: string): Promise<CampaignReport[]> {
  const list = await db
    .select({ campaign: campaigns, productName: products.name, platform: products.platform })
    .from(campaigns)
    .innerJoin(products, eq(products.id, campaigns.productId))
    .where(and(eq(campaigns.orgId, orgId), sql`${campaigns.status} <> 'archived'`))
    .orderBy(desc(campaigns.createdAt));
  if (list.length === 0) return [];

  const taskRows = await db
    .select({
      campaignId: campaignTasks.campaignId,
      seq: campaignTasks.seq,
      event: campaignTasks.mmpEventName,
      name: campaignTasks.displayName,
      completions: sql<string>`count(${conversions.id}) filter (where ${conversions.status} = 'approved')`,
      spend: sql<string>`coalesce(sum(${conversions.advertiserPrice}) filter (where ${conversions.status} = 'approved'), 0)`,
    })
    .from(campaignTasks)
    .innerJoin(campaigns, eq(campaigns.id, campaignTasks.campaignId))
    .leftJoin(conversions, eq(conversions.taskId, campaignTasks.id))
    .where(eq(campaigns.orgId, orgId))
    .groupBy(campaignTasks.id);

  const clickRows = await db
    .select({ campaignId: clicks.campaignId, n: sql<string>`count(*)` })
    .from(clicks)
    .innerJoin(campaigns, eq(campaigns.id, clicks.campaignId))
    .where(eq(campaigns.orgId, orgId))
    .groupBy(clicks.campaignId);

  return list.map(({ campaign, productName, platform }) => {
    const tasks = taskRows
      .filter((t) => t.campaignId === campaign.id)
      .sort((a, b) => a.seq - b.seq)
      .map((t) => ({ seq: t.seq, event: t.event, name: t.name.en ?? t.event, completions: Number(t.completions), spend: BigInt(t.spend) }));
    return {
      id: campaign.id,
      name: campaign.title.en ?? campaign.name,
      status: campaign.status,
      productName,
      platform,
      countries: campaign.countries,
      totalBudget: campaign.totalBudget,
      spend: tasks.reduce((sum, t) => sum + t.spend, 0n),
      clicks: Number(clickRows.find((c) => c.campaignId === campaign.id)?.n ?? 0),
      tasks,
    };
  });
}

/** Approved spend and installs by click country for the last `days` days. */
export async function advertiserCountries(db: Db, orgId: string, days: number, now = new Date()) {
  const rows = await db
    .select({
      country: clicks.country,
      spend: sql<string>`coalesce(sum(${conversions.advertiserPrice}), 0)`,
      installs: sql<string>`count(*) filter (where ${campaignTasks.mmpEventName} = 'install')`,
    })
    .from(conversions)
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .innerJoin(clicks, eq(clicks.id, conversions.clickId))
    .where(and(eq(campaigns.orgId, orgId), eq(conversions.status, 'approved'), gte(conversions.createdAt, new Date(now.getTime() - days * DAY_MS))))
    .groupBy(clicks.country)
    .orderBy(desc(sql`2`));
  return rows.map((r) => ({ country: r.country ?? '—', spend: BigInt(r.spend), installs: Number(r.installs) }));
}

/** Public, coarse categories for why a conversion was not billed (no fraud-rule internals). */
const PUBLIC_REASON: Record<string, string> = {
  ctit_too_short: 'timing',
  outside_attribution_window: 'timing',
  task_time_limit_exceeded: 'timing',
  install_not_attributed: 'not_attributed',
  duplicate_user: 'duplicate',
  no_price: 'not_targeted',
  insufficient_balance: 'balance',
};

export type PublicStatus = 'billed' | 'not_billed' | 'in_review' | 'refunded';

export interface ConversionRow {
  id: string;
  createdAt: Date;
  campaignName: string;
  event: string;
  clickId: string;
  country: string | null;
  status: PublicStatus;
  reason: string | null;
  price: bigint;
}

export async function advertiserConversions(
  db: Db,
  orgId: string,
  filter: { campaignId?: string; status?: PublicStatus; limit?: number; before?: Date } = {},
): Promise<ConversionRow[]> {
  const statusMap = { billed: 'approved', not_billed: 'rejected', in_review: 'held', refunded: 'reversed' } as const;
  const rows = await db
    .select({ conversion: conversions, campaignTitle: campaigns.title, campaignName: campaigns.name, event: campaignTasks.mmpEventName, country: clicks.country })
    .from(conversions)
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .innerJoin(clicks, eq(clicks.id, conversions.clickId))
    .where(
      and(
        eq(campaigns.orgId, orgId),
        filter.campaignId ? eq(conversions.campaignId, filter.campaignId) : undefined,
        filter.status ? eq(conversions.status, statusMap[filter.status]) : undefined,
        filter.before ? lt(conversions.createdAt, filter.before) : undefined,
      ),
    )
    .orderBy(desc(conversions.createdAt))
    .limit(Math.min(filter.limit ?? 100, 10_000));

  return rows.map(({ conversion: c, campaignTitle, campaignName, event, country }) => {
    const status: PublicStatus = c.status === 'approved' ? 'billed' : c.status === 'held' ? 'in_review' : c.status === 'reversed' ? 'refunded' : 'not_billed';
    const reason = status === 'not_billed' ? (c.reasons.map((r) => PUBLIC_REASON[r]).find(Boolean) ?? 'quality') : null;
    return {
      id: c.id,
      createdAt: c.createdAt,
      campaignName: campaignTitle.en ?? campaignName,
      event,
      clickId: c.clickId,
      country,
      status,
      reason,
      price: status === 'billed' ? c.advertiserPrice : 0n,
    };
  });
}

/** CSV of the conversion log, for reconciliation against the advertiser's MMP. */
export function conversionsCsv(rows: ConversionRow[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = 'time_utc,conversion_id,click_id,campaign,event,country,status,reason,billed_usd';
  const lines = rows.map((r) =>
    [r.createdAt.toISOString(), r.id, r.clickId, r.campaignName, r.event, r.country ?? '', r.status, r.reason ?? '', (Number(r.price) / 1e6).toFixed(6)].map(esc).join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

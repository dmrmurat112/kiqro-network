import { and, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { fillMacros, formatMicros, sign, toPoints } from '@kiqro/core';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { z } from 'zod';
import type { AdvertiserSession } from '../advertiser/auth.ts';
import { localizedIssues, translateMessage, type FieldIssue, type UiLocale } from '../validation.ts';
import { isAllowedWebhookUrl } from '../webhooks.ts';

/** Publisher postback targets: public https endpoints (plus localhost outside production). */
export const allowedPostbackUrl = (v: string) => isAllowedWebhookUrl(v) || (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost[:/]/.test(v));

/**
 * Publisher tools: currency sales (reward multipliers), user bans, daily statistics for the
 * Publisher Stats API and the postback tester.
 */

const { auditLog, clicks, conversions, currencySales, placements, publisherUserBans } = schema;
const DAY_MS = 86_400_000;

type Result = { ok: true } | { ok: false; issues: FieldIssue[] };
const fail = (key: string, locale: UiLocale, path = ''): { ok: false; issues: FieldIssue[] } => ({ ok: false, issues: [{ path, message: translateMessage(key, locale) }] });

async function ownPlacement(db: DbOrTx, session: AdvertiserSession, placementId: string) {
  return db.query.placements.findFirst({ where: and(eq(placements.id, placementId), eq(placements.publisherOrgId, session.org.id)) });
}

async function audit(db: DbOrTx, session: AdvertiserSession, action: string, entityId: string, details: Record<string, unknown>) {
  await db.insert(auditLog).values({ id: newId('audit'), adminUserId: null, action, entityType: 'placement', entityId, details: { ...details, advertiserUserId: session.user.id } });
}

// ---------- Currency sales ----------

/** Multiplier (basis points, 10000 = ×1) of the sale running on a placement at a moment. */
export async function saleMultiplierAt(db: DbOrTx, placementId: string, at: Date): Promise<number> {
  const sale = await db.query.currencySales.findFirst({
    where: and(eq(currencySales.placementId, placementId), lte(currencySales.startsAt, at), gt(currencySales.endsAt, at)),
    orderBy: desc(currencySales.multiplierBps),
  });
  return sale?.multiplierBps ?? 10_000;
}

/** The sale running now, if any (for the offerwall banner and the Offers API). */
export async function activeSale(db: DbOrTx, placementId: string, now = new Date()) {
  return db.query.currencySales.findFirst({
    where: and(eq(currencySales.placementId, placementId), lte(currencySales.startsAt, now), gt(currencySales.endsAt, now)),
    orderBy: desc(currencySales.multiplierBps),
  });
}

/**
 * Points a user earns for a publisher payout: the placement's exchange rate, times the
 * multiplier of the currency sale that ran when the user clicked the offer.
 */
export async function rewardPoints(db: DbOrTx, placement: { id: string; pointsPerUsd: string }, publisherPayout: bigint, clickedAt: Date): Promise<bigint> {
  const base = toPoints(publisherPayout, placement.pointsPerUsd);
  const bps = await saleMultiplierAt(db, placement.id, clickedAt);
  return multiplyPoints(base, bps);
}

/** Points times a sale multiplier in basis points (15000 = ×1.5), rounded down. */
export function multiplyPoints(points: bigint, bps: number): bigint {
  return bps === 10_000 ? points : (points * BigInt(bps)) / 10_000n;
}

export async function listCurrencySales(db: Db, placementId: string, now = new Date()) {
  return db
    .select()
    .from(currencySales)
    .where(and(eq(currencySales.placementId, placementId), gt(currencySales.endsAt, new Date(now.getTime() - 30 * DAY_MS))))
    .orderBy(desc(currencySales.startsAt));
}

const saleInput = z
  .object({
    multiplier: z
      .string()
      .trim()
      .regex(/^\d(\.\d{1,2})?$/, 'sale_multiplier')
      .refine((v) => Number(v) > 1 && Number(v) <= 5, 'sale_multiplier'),
    startsAt: z.coerce.date({ message: 'date' }),
    endsAt: z.coerce.date({ message: 'date' }),
  })
  .superRefine((d, ctx) => {
    if (d.endsAt <= d.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'end_before_start' });
    if (d.endsAt.getTime() - d.startsAt.getTime() > 31 * DAY_MS) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'sale_too_long' });
  });

/** Schedules a currency sale (×1.01–×5, at most 31 days). Overlapping sales use the highest multiplier. */
export async function createCurrencySale(db: Db, session: AdvertiserSession, placementId: string, input: unknown, locale: UiLocale, now = new Date()): Promise<Result> {
  if (session.user.role !== 'admin') return fail('placement_admin_only', locale);
  const parsed = saleInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: localizedIssues(parsed.error, locale) };
  const d = parsed.data;
  if (d.endsAt <= now) return fail('end_before_start', locale, 'endsAt');
  const placement = await ownPlacement(db, session, placementId);
  if (!placement) return fail('placement_not_found', locale);
  const multiplierBps = Math.round(Number(d.multiplier) * 10_000);
  await db.transaction(async (tx) => {
    const id = newId('currencySale');
    await tx.insert(currencySales).values({ id, placementId, multiplierBps, startsAt: d.startsAt, endsAt: d.endsAt });
    await audit(tx, session, 'publisher.sale.create', placementId, { saleId: id, multiplierBps, startsAt: d.startsAt, endsAt: d.endsAt });
  });
  return { ok: true };
}

/** Ends a running sale now, or removes one that has not started. */
export async function endCurrencySale(db: Db, session: AdvertiserSession, saleId: string, locale: UiLocale, now = new Date()): Promise<Result> {
  if (session.user.role !== 'admin') return fail('placement_admin_only', locale);
  const sale = await db.query.currencySales.findFirst({ where: eq(currencySales.id, saleId) });
  if (!sale || !(await ownPlacement(db, session, sale.placementId))) return fail('placement_not_found', locale);
  await db.transaction(async (tx) => {
    if (sale.startsAt > now) await tx.delete(currencySales).where(eq(currencySales.id, saleId));
    else if (sale.endsAt > now) await tx.update(currencySales).set({ endsAt: now }).where(eq(currencySales.id, saleId));
    await audit(tx, session, 'publisher.sale.end', sale.placementId, { saleId });
  });
  return { ok: true };
}

// ---------- User bans ----------

export async function isUserBanned(db: DbOrTx, publisherOrgId: string, publisherUserId: string): Promise<boolean> {
  const row = await db.query.publisherUserBans.findFirst({ where: and(eq(publisherUserBans.publisherOrgId, publisherOrgId), eq(publisherUserBans.publisherUserId, publisherUserId)), columns: { id: true } });
  return Boolean(row);
}

export async function listUserBans(db: Db, publisherOrgId: string) {
  return db.select().from(publisherUserBans).where(eq(publisherUserBans.publisherOrgId, publisherOrgId)).orderBy(desc(publisherUserBans.createdAt));
}

const banInput = z.object({ userId: z.string().trim().min(1, 'user_id_required').max(200), reason: z.string().trim().max(300).default('') });

/** Blocks a user on all of the publisher's placements: no offers, clicks refused. Idempotent. */
export async function banUser(db: Db, publisherOrgId: string, input: unknown, locale: UiLocale, actor?: AdvertiserSession): Promise<Result> {
  if (actor && actor.user.role !== 'admin') return fail('placement_admin_only', locale);
  const parsed = banInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: localizedIssues(parsed.error, locale) };
  const d = parsed.data;
  await db
    .insert(publisherUserBans)
    .values({ id: newId('userBan'), publisherOrgId, publisherUserId: d.userId, reason: d.reason || null })
    .onConflictDoNothing();
  return { ok: true };
}

export async function unbanUser(db: Db, publisherOrgId: string, publisherUserId: string, actor?: AdvertiserSession): Promise<Result> {
  if (actor && actor.user.role !== 'admin') return fail('placement_admin_only', 'en');
  await db.delete(publisherUserBans).where(and(eq(publisherUserBans.publisherOrgId, publisherOrgId), eq(publisherUserBans.publisherUserId, publisherUserId)));
  return { ok: true };
}

// ---------- Publisher Stats API ----------

export interface PublisherStatsDay {
  date: string;
  clicks: number;
  users: number;
  rewards: number;
  reversals: number;
  earnings_usd: string;
  points: string;
}

/**
 * Daily statistics of one placement (UTC days, at most 92): clicks, distinct users who clicked,
 * rewarded steps, reversals, the publisher's earnings in USD (net of reversals) and the
 * points given to users.
 */
export async function placementDailyStats(db: Db, placementId: string, from: Date, to: Date): Promise<PublisherStatsDay[]> {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) + DAY_MS);
  const days = new Map<string, { clicks: number; users: number; rewards: number; reversals: number; earnings: bigint; points: bigint }>();
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) days.set(new Date(t).toISOString().slice(0, 10), { clicks: 0, users: 0, rewards: 0, reversals: 0, earnings: 0n, points: 0n });
  const day = (col: unknown) => sql<string>`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`;

  const cl = await db
    .select({ day: day(clicks.createdAt), n: sql<string>`count(*)`, users: sql<string>`count(distinct ${clicks.publisherUserId})` })
    .from(clicks)
    .where(and(eq(clicks.placementId, placementId), gte(clicks.createdAt, start), lt(clicks.createdAt, end)))
    .groupBy(sql`1`);
  for (const r of cl) Object.assign(days.get(r.day) ?? {}, { clicks: Number(r.n), users: Number(r.users) });

  // Rewards count on the day they were credited; reversals on the day they were taken back.
  const rw = await db
    .select({ day: day(conversions.createdAt), n: sql<string>`count(*)`, payout: sql<string>`coalesce(sum(${conversions.publisherPayout}), 0)`, points: sql<string>`coalesce(sum(${conversions.userRewardPoints}), 0)` })
    .from(conversions)
    .where(and(eq(conversions.placementId, placementId), inArray(conversions.status, ['approved', 'reversed']), gte(conversions.createdAt, start), lt(conversions.createdAt, end)))
    .groupBy(sql`1`);
  for (const r of rw) {
    const d = days.get(r.day);
    if (d) Object.assign(d, { rewards: Number(r.n), earnings: BigInt(r.payout), points: BigInt(r.points) });
  }
  const rv = await db
    .select({ day: day(conversions.reversedAt), n: sql<string>`count(*)`, payout: sql<string>`coalesce(sum(${conversions.publisherPayout}), 0)`, points: sql<string>`coalesce(sum(${conversions.userRewardPoints}), 0)` })
    .from(conversions)
    .where(and(eq(conversions.placementId, placementId), eq(conversions.status, 'reversed'), gte(conversions.reversedAt, start), lt(conversions.reversedAt, end)))
    .groupBy(sql`1`);
  for (const r of rv) {
    const d = days.get(r.day);
    if (d) Object.assign(d, { reversals: Number(r.n), earnings: d.earnings - BigInt(r.payout), points: d.points - BigInt(r.points) });
  }
  return [...days.entries()].map(([date, d]) => ({
    date,
    clicks: d.clicks,
    users: d.users,
    rewards: d.rewards,
    reversals: d.reversals,
    earnings_usd: formatMicros(d.earnings),
    points: d.points.toString(),
  }));
}

// ---------- Postback tester ----------

type Fetcher = (url: string, init: { signal: AbortSignal; redirect: 'manual' }) => Promise<{ status: number }>;

const testerInput = z.object({
  userId: z.string().trim().min(1, 'user_id_required').max(200),
  offerId: z.string().trim().max(100).default('cmp_TEST'),
  offerName: z.string().trim().max(200).default('Kiqro test offer'),
  taskId: z.string().trim().max(100).default('tsk_TEST'),
  taskName: z.string().trim().max(200).default('Test step'),
  amount: z.string().trim().regex(/^\d{1,9}$/, 'amount'),
  payoutUsd: z.string().trim().regex(/^\d{1,6}(\.\d{1,6})?$/, 'amount').default('0.10'),
  status: z.enum(['1', '2']),
  custom: z.array(z.string().max(200)).max(5).default([]),
});

/**
 * Sends one postback with values the publisher chose (reward or reversal), signed like real
 * ones and marked is_sandbox=1, so the publisher can see how its server handles each case.
 * No conversion is recorded and nothing is billed.
 */
export async function sendTesterPostback(db: Db, session: AdvertiserSession, placementId: string, input: unknown, locale: UiLocale, fetcher: Fetcher = fetch as unknown as Fetcher) {
  const placement = await ownPlacement(db, session, placementId);
  if (!placement) return { ok: false as const, issues: fail('placement_not_found', locale).issues };
  if (!placement.postbackUrl || !allowedPostbackUrl(placement.postbackUrl)) return { ok: false as const, issues: fail('postback_url_missing', locale, 'postbackUrl').issues };
  const parsed = testerInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, issues: localizedIssues(parsed.error, locale) };
  const d = parsed.data;
  const transactionId = `sbx_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const url = fillMacros(placement.postbackUrl, {
    ...postbackMacros({
      userId: d.userId,
      amount: d.amount,
      payoutUsd: d.payoutUsd,
      transactionId,
      offerId: d.offerId,
      offerName: d.offerName,
      offerNameTr: d.offerName,
      taskId: d.taskId,
      taskName: d.taskName,
      taskNameTr: d.taskName,
      status: Number(d.status) as 1 | 2,
      country: 'TR',
      ip: '0.0.0.0',
      clickTime: now,
      eventTime: now,
      appKey: placement.appKey,
      reversalReason: d.status === '2' ? 'test' : null,
      custom: d.custom,
      sandbox: true,
    }),
    signature: sign(placement.secret, [d.userId, d.amount, transactionId, d.status]),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetcher(url, { signal: controller.signal, redirect: 'manual' });
    return { ok: true as const, status: res.status, url };
  } catch (e) {
    return { ok: true as const, error: e instanceof Error ? e.message : String(e), url };
  } finally {
    clearTimeout(timer);
  }
}

/** Macro values every publisher postback carries (the signature is added by the caller). */
export function postbackMacros(v: {
  userId: string;
  amount: string;
  payoutUsd: string;
  transactionId: string;
  offerId: string;
  offerName: string;
  offerNameTr: string;
  taskId: string;
  taskName: string;
  taskNameTr: string;
  status: 1 | 2;
  country: string | null;
  ip: string | null;
  clickTime: Date;
  eventTime: Date;
  appKey: string;
  reversalReason: string | null;
  custom: (string | undefined)[];
  sandbox: boolean;
}) {
  return {
    user_id: v.userId,
    amount: v.amount,
    payout_usd: v.payoutUsd,
    transaction_id: v.transactionId,
    offer_id: v.offerId,
    offer_name: v.offerName,
    offer_name_tr: v.offerNameTr,
    task_id: v.taskId,
    task_name: v.taskName,
    task_name_tr: v.taskNameTr,
    status: v.status,
    country: v.country,
    ip: v.ip,
    click_time: Math.floor(v.clickTime.getTime() / 1000),
    event_time: Math.floor(v.eventTime.getTime() / 1000),
    app_key: v.appKey,
    reversal_reason: v.status === 2 ? (v.reversalReason ?? '') : '',
    custom_1: v.custom[0],
    custom_2: v.custom[1],
    custom_3: v.custom[2],
    custom_4: v.custom[3],
    custom_5: v.custom[4],
    is_sandbox: v.sandbox ? 1 : 0,
  };
}

/** Longest range the Publisher Stats API returns in one call. */
export const MAX_STATS_DAYS = 92;

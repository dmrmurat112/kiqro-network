import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { fillMacros, formatMicros, sign } from '@kiqro/core';
import { getAccountId, getBalance, newId, schema, type Db } from '@kiqro/db';
import { z } from 'zod';
import type { AdvertiserSession } from '../advertiser/auth.ts';
import { localizedIssues, translateMessage, type FieldIssue, type UiLocale } from '../validation.ts';
import { isAllowedWebhookUrl } from '../webhooks.ts';

/**
 * Publisher panel: publishers sign in with the same panel accounts as advertisers (users of a
 * publisher organization) and see their placements, earnings and postbacks.
 */

const { auditLog, campaigns, campaignTasks, clicks, conversions, placements } = schema;
const DAY_MS = 86_400_000;

export type PublisherResult = { ok: true } | { ok: false; issues: FieldIssue[] };
const fail = (key: string, locale: UiLocale, path = ''): PublisherResult => ({ ok: false, issues: [{ path, message: translateMessage(key, locale) }] });

export interface PublisherDay {
  date: string;
  earnings: bigint;
  conversions: number;
  clicks: number;
}

/** Earnings (publisher share of approved conversions, minus reversals) and activity per UTC day. */
export async function publisherOverview(db: Db, orgId: string, days: number, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS);
  const own = await db.select({ id: placements.id }).from(placements).where(eq(placements.publisherOrgId, orgId));
  const ids = own.map((p) => p.id);
  const payable = await getBalance(db, await getAccountId(db, 'publisher_payable', orgId));
  const series = new Map<string, PublisherDay>();
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    series.set(date, { date, earnings: 0n, conversions: 0, clicks: 0 });
  }
  if (ids.length) {
    const conv = await db
      .select({ day: sql<string>`to_char(${conversions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`, payout: sql<string>`coalesce(sum(${conversions.publisherPayout}), 0)`, n: sql<string>`count(*)` })
      .from(conversions)
      .where(and(inArray(conversions.placementId, ids), eq(conversions.status, 'approved'), gte(conversions.createdAt, start)))
      .groupBy(sql`1`);
    for (const r of conv) {
      const d = series.get(r.day);
      if (d) Object.assign(d, { earnings: BigInt(r.payout), conversions: Number(r.n) });
    }
    const cl = await db
      .select({ day: sql<string>`to_char(${clicks.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`, n: sql<string>`count(*)` })
      .from(clicks)
      .where(and(inArray(clicks.placementId, ids), gte(clicks.createdAt, start)))
      .groupBy(sql`1`);
    for (const r of cl) {
      const d = series.get(r.day);
      if (d) d.clicks = Number(r.n);
    }
  }
  const list = [...series.values()];
  return {
    payable,
    earnings: list.reduce((s, d) => s + d.earnings, 0n),
    conversions: list.reduce((s, d) => s + d.conversions, 0),
    clicks: list.reduce((s, d) => s + d.clicks, 0),
    series: list,
  };
}

export async function publisherPlacements(db: Db, orgId: string) {
  return db.select().from(placements).where(eq(placements.publisherOrgId, orgId)).orderBy(desc(placements.createdAt));
}

/** Latest conversions on the publisher's placements (what its users were rewarded for). */
export async function publisherConversions(db: Db, orgId: string, limit = 200) {
  return db
    .select({
      id: conversions.id,
      createdAt: conversions.createdAt,
      publisherUserId: conversions.publisherUserId,
      status: conversions.status,
      payout: conversions.publisherPayout,
      points: conversions.userRewardPoints,
      offer: campaigns.title,
      task: campaignTasks.displayName,
      placement: placements.name,
      country: clicks.country,
    })
    .from(conversions)
    .innerJoin(placements, eq(placements.id, conversions.placementId))
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .innerJoin(clicks, eq(clicks.id, conversions.clickId))
    .where(and(eq(placements.publisherOrgId, orgId), inArray(conversions.status, ['approved', 'held', 'reversed'])))
    .orderBy(desc(conversions.createdAt))
    .limit(limit);
}

/** Public https in production (Kiqro's servers call it); http://localhost too in development. */
const allowedPostbackUrl = (v: string) => isAllowedWebhookUrl(v) || (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost[:/]/.test(v));

const placementSettings = z.object({
  currencyName: z.string().trim().min(1, 'name_short').max(40),
  pointsPerUsd: z.string().trim().regex(/^\d+(\.\d{1,6})?$/, 'amount'),
  postbackUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || allowedPostbackUrl(v), 'url_https')
    .transform((v) => v || null),
  brandColor: z
    .string()
    .trim()
    .refine((v) => v === '' || /^#[0-9a-fA-F]{6}$/.test(v), 'color')
    .transform((v) => v.toLowerCase() || null)
    .default(''),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\/[^\s"'<>]+$/.test(v), 'url_https')
    .transform((v) => v || null)
    .default(''),
  wallTitle: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null)
    .default(''),
});

/**
 * The publisher's own settings of a placement: virtual currency name, points per USD (its
 * exchange rate, spec decision K-6), postback URL and the hosted offerwall's branding. The
 * revenue share stays with Kiqro.
 */
export async function updatePlacementSettings(db: Db, session: AdvertiserSession, placementId: string, input: unknown, locale: UiLocale): Promise<PublisherResult> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  const parsed = placementSettings.safeParse(input);
  if (!parsed.success) return { ok: false, issues: localizedIssues(parsed.error, locale) };
  const d = parsed.data;
  if (Number(d.pointsPerUsd) <= 0) return fail('amount', locale, 'pointsPerUsd');
  return db.transaction(async (tx) => {
    const placement = await tx.query.placements.findFirst({ where: and(eq(placements.id, placementId), eq(placements.publisherOrgId, session.org.id)) });
    if (!placement) return fail('not_found', locale);
    await tx
      .update(placements)
      .set({ currencyName: d.currencyName, pointsPerUsd: d.pointsPerUsd, postbackUrl: d.postbackUrl, brandColor: d.brandColor, logoUrl: d.logoUrl, wallTitle: d.wallTitle })
      .where(eq(placements.id, placementId));
    await tx.insert(auditLog).values({
      id: newId('audit'),
      adminUserId: null,
      action: 'publisher.placement.update',
      entityType: 'placement',
      entityId: placementId,
      details: {
        before: { currencyName: placement.currencyName, pointsPerUsd: placement.pointsPerUsd, postbackUrl: placement.postbackUrl, brandColor: placement.brandColor, logoUrl: placement.logoUrl, wallTitle: placement.wallTitle },
        after: d,
        advertiserUserId: session.user.id,
      },
    });
    return { ok: true } as const;
  });
}

type Fetcher = (url: string, init: { signal: AbortSignal; redirect: 'manual' }) => Promise<{ status: number }>;

/**
 * Sends one signed test postback (status=1, transaction_id "test_…") to the placement's URL and
 * reports the HTTP status, so publishers can check their endpoint before going live.
 */
export async function sendTestPostback(db: Db, session: AdvertiserSession, placementId: string, fetcher: Fetcher = fetch as unknown as Fetcher) {
  const placement = await db.query.placements.findFirst({ where: and(eq(placements.id, placementId), eq(placements.publisherOrgId, session.org.id)) });
  if (!placement?.postbackUrl) return { ok: false as const, error: 'no_postback_url' };
  if (!allowedPostbackUrl(placement.postbackUrl)) return { ok: false as const, error: 'postback_url_not_allowed' };
  const transactionId = `test_${Date.now()}`;
  const amount = '100';
  const url = fillMacros(placement.postbackUrl, {
    user_id: 'kiqro_test_user',
    amount,
    payout_usd: formatMicros(100_000n),
    transaction_id: transactionId,
    offer_id: 'cmp_TEST',
    offer_name: 'Kiqro test offer',
    task_id: 'tsk_TEST',
    task_name: 'Test step',
    offer_name_tr: 'Kiqro test teklifi',
    task_name_tr: 'Test adımı',
    status: 1,
    country: 'FI',
    signature: sign(placement.secret, ['kiqro_test_user', amount, transactionId, 1]),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetcher(url, { signal: controller.signal, redirect: 'manual' });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, url };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e), url };
  } finally {
    clearTimeout(timer);
  }
}

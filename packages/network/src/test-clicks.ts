import { randomBytes } from 'node:crypto';
import { and, count, desc, eq, gte, inArray, ne } from 'drizzle-orm';
import { newId, schema, type Db } from '@kiqro/db';
import { audit } from './admin/audit.ts';
import type { AdminUser } from './admin/auth.ts';
import { AdminError, requirePermission } from './admin/errors.ts';

const { campaignTasks, campaigns, clicks, conversions, organizations, placements } = schema;

/**
 * Test clicks let an advertiser try its postbacks (S2S or MMP) without a real user; Kiqro staff
 * create them in the admin panel, advertisers on the panel's Integration page. They sit on an
 * internal, paused placement: no publisher sees them, and conversions on them are approved for
 * free — nothing is billed, paid out or sent to a publisher.
 */
export const TEST_ORG_ID = 'org_kiqro_test';
export const TEST_PLACEMENT_ID = 'plc_kiqro_test';
/** Test clicks an advertiser may create per 24 hours in the panel. */
export const ADVERTISER_TEST_CLICKS_PER_DAY = 20;

type Campaign = typeof campaigns.$inferSelect;

async function ensureTestPlacement(db: Db): Promise<void> {
  await db.insert(organizations).values({ id: TEST_ORG_ID, type: 'internal', name: 'Kiqro test', status: 'active' }).onConflictDoNothing();
  await db
    .insert(placements)
    .values({
      id: TEST_PLACEMENT_ID,
      publisherOrgId: TEST_ORG_ID,
      name: 'Test clicks',
      appKey: `test_${randomBytes(12).toString('hex')}`,
      secret: randomBytes(24).toString('hex'),
      type: 'api',
      status: 'paused',
      currencyName: 'Test',
      pointsPerUsd: '0',
      revshareBps: 0,
    })
    .onConflictDoNothing();
}

async function insertTestClick(db: Db, campaign: Campaign, now: Date): Promise<string> {
  await ensureTestPlacement(db);
  const id = newId('click');
  await db.insert(clicks).values({
    id,
    campaignId: campaign.id,
    placementId: TEST_PLACEMENT_ID,
    // A fresh user per test click, so each one can complete every task once.
    publisherUserId: `test_${randomBytes(6).toString('hex')}`,
    country: campaign.countries[0] ?? null,
    createdAt: now,
  });
  return id;
}

/** Kiqro staff: a test click on any campaign (any status). Returns its click_id. */
export async function createTestClick(db: Db, actor: AdminUser, campaignId: string, now = new Date()): Promise<string> {
  requirePermission(actor, 'manage_campaigns');
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!campaign) throw new AdminError('Kampanya bulunamadı.');
  const id = await insertTestClick(db, campaign, now);
  await audit(db, actor.id, 'campaign.test_click', 'campaign', campaignId, { clickId: id });
  return id;
}

/** ctitMinSeconds: how long after the click the install postback must come at the earliest. */
export type AdvertiserTestClickResult = { ok: true; clickId: string; ctitMinSeconds: number } | { ok: false; reason: 'not_found' | 'limit' };

/** An advertiser's own test click on one of its campaigns, at most ADVERTISER_TEST_CLICKS_PER_DAY a day. */
export async function createAdvertiserTestClick(db: Db, orgId: string, campaignId: string, now = new Date()): Promise<AdvertiserTestClickResult> {
  const campaign = await db.query.campaigns.findFirst({ where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId), ne(campaigns.status, 'archived')) });
  if (!campaign) return { ok: false, reason: 'not_found' };
  const [recent] = await db
    .select({ n: count() })
    .from(clicks)
    .innerJoin(campaigns, eq(campaigns.id, clicks.campaignId))
    .where(and(eq(campaigns.orgId, orgId), eq(clicks.placementId, TEST_PLACEMENT_ID), gte(clicks.createdAt, new Date(now.getTime() - 86_400_000))));
  if (recent!.n >= ADVERTISER_TEST_CLICKS_PER_DAY) return { ok: false, reason: 'limit' };
  return { ok: true, clickId: await insertTestClick(db, campaign, now), ctitMinSeconds: campaign.ctitMinSeconds };
}

/** Latest test clicks of one campaign, or of all an advertiser's campaigns, with the events received for each. */
export async function listTestClicks(db: Db, scope: { campaignId: string } | { orgId: string }, limit = 5) {
  const rows = await db
    .select({ id: clicks.id, createdAt: clicks.createdAt, campaignId: clicks.campaignId, campaignName: campaigns.name })
    .from(clicks)
    .innerJoin(campaigns, eq(campaigns.id, clicks.campaignId))
    .where(and(eq(clicks.placementId, TEST_PLACEMENT_ID), 'campaignId' in scope ? eq(clicks.campaignId, scope.campaignId) : eq(campaigns.orgId, scope.orgId)))
    .orderBy(desc(clicks.createdAt))
    .limit(limit);
  const events = rows.length
    ? await db
        .select({ clickId: conversions.clickId, event: campaignTasks.mmpEventName, status: conversions.status, reasons: conversions.reasons, createdAt: conversions.createdAt })
        .from(conversions)
        .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
        .where(inArray(conversions.clickId, rows.map((r) => r.id)))
        .orderBy(conversions.createdAt)
    : [];
  return rows.map((r) => ({ ...r, events: events.filter((e) => e.clickId === r.id).map((e) => ({ ...e, reasons: e.reasons.filter((x) => x !== 'test_click') })) }));
}

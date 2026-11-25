import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { newId, schema, type Db } from '@kiqro/db';
import { audit } from './admin/audit.ts';
import type { AdminUser } from './admin/auth.ts';
import { AdminError, requirePermission } from './admin/errors.ts';

const { campaignTasks, campaigns, clicks, conversions, organizations, placements } = schema;

/**
 * Kiqro staff create test clicks so an advertiser can try its postbacks (S2S or MMP) without a
 * real user. They sit on an internal, paused placement: no publisher sees them, and conversions
 * on them are approved for free — nothing is billed, paid out or sent to a publisher.
 */
export const TEST_ORG_ID = 'org_kiqro_test';
export const TEST_PLACEMENT_ID = 'plc_kiqro_test';

async function ensureTestPlacement(db: Db): Promise<void> {
  await db.insert(organizations).values({ id: TEST_ORG_ID, type: 'internal', name: 'Kiqro test', status: 'active' }).onConflictDoNothing();
  await db
    .insert(placements)
    .values({
      id: TEST_PLACEMENT_ID,
      publisherOrgId: TEST_ORG_ID,
      name: 'Admin test clicks',
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

/** Creates a test click on the campaign (any status) and returns its click_id. */
export async function createTestClick(db: Db, actor: AdminUser, campaignId: string, now = new Date()): Promise<string> {
  requirePermission(actor, 'manage_campaigns');
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!campaign) throw new AdminError('Kampanya bulunamadı.');
  await ensureTestPlacement(db);
  const id = newId('click');
  await db.transaction(async (tx) => {
    await tx.insert(clicks).values({
      id,
      campaignId,
      placementId: TEST_PLACEMENT_ID,
      // A fresh user per test click, so each one can complete every task once.
      publisherUserId: `test_${randomBytes(6).toString('hex')}`,
      country: campaign.countries[0] ?? null,
      createdAt: now,
    });
    await audit(tx, actor.id, 'campaign.test_click', 'campaign', campaignId, { clickId: id });
  });
  return id;
}

/** The campaign's latest test clicks with the events received for each. */
export async function listTestClicks(db: Db, campaignId: string, limit = 5) {
  const rows = await db
    .select({ id: clicks.id, createdAt: clicks.createdAt })
    .from(clicks)
    .where(and(eq(clicks.campaignId, campaignId), eq(clicks.placementId, TEST_PLACEMENT_ID)))
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
  return rows.map((r) => ({ ...r, events: events.filter((e) => e.clickId === r.id) }));
}

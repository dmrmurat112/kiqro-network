import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getAccountId, lockAccount, schema, type Db } from '@kiqro/db';
import { creditPosition } from '../billing/credit.ts';
import { creditConversion } from '../conversions.ts';
import { enqueuePublisherPostback, retryFailedPostback } from '../outbox.ts';
import { audit } from './audit.ts';
import type { AdminUser } from './auth.ts';
import { AdminError, requirePermission } from './errors.ts';
import { parseInput } from './organizations.ts';

const { campaignTasks, campaigns, conversions, organizations, placements, postbacksRaw, publisherPostbacks } = schema;

const noteInput = z.string().trim().min(3, 'bir not yazın (neden onaylandı/reddedildi)').max(500);

async function lockHeld(tx: Parameters<Parameters<Db['transaction']>[0]>[0], conversionId: string) {
  const [row] = await tx
    .select({ conversion: conversions, campaign: campaigns, placement: placements })
    .from(conversions)
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(placements, eq(placements.id, conversions.placementId))
    .where(eq(conversions.id, conversionId))
    .for('update', { of: conversions });
  if (!row) throw new AdminError('Dönüşüm bulunamadı.');
  if (row.conversion.status !== 'held') throw new AdminError('Yalnızca bekleyen (held) dönüşümler incelenebilir.');
  return row;
}

/** Approves a held conversion: bills the advertiser, credits the publisher and sends the reward postback. */
export async function approveHeldConversion(db: Db, actor: AdminUser, conversionId: string, note: string, now = new Date()): Promise<void> {
  requirePermission(actor, 'review');
  const reason = parseInput(noteInput, note);
  await db.transaction(async (tx) => {
    const { conversion, campaign, placement } = await lockHeld(tx, conversionId);
    if (conversion.advertiserPrice <= 0n) throw new AdminError('Bu dönüşümün fiyatı yok; onaylanamaz.');
    const advertiserAccount = await getAccountId(tx, 'advertiser_balance', campaign.orgId);
    await lockAccount(tx, advertiserAccount);
    if ((await creditPosition(tx, campaign.orgId, now)).spendable < conversion.advertiserPrice) {
      throw new AdminError('Reklamveren bakiyesi (ve kredi limiti) bu dönüşümü karşılamıyor. Önce bakiye yüklenmeli.');
    }
    await creditConversion(tx, {
      conversionId,
      advertiserAccount,
      publisherOrgId: placement.publisherOrgId,
      advertiserPrice: conversion.advertiserPrice,
      publisherPayout: conversion.publisherPayout,
    });
    await tx.update(conversions).set({ status: 'approved' }).where(eq(conversions.id, conversionId));
    await enqueuePublisherPostback(tx, conversionId, 'credit', now);
    await audit(tx, actor.id, 'conversion.approve', 'conversion', conversionId, { note: reason, reasons: conversion.reasons });
  });
}

export async function rejectHeldConversion(db: Db, actor: AdminUser, conversionId: string, note: string): Promise<void> {
  requirePermission(actor, 'review');
  const reason = parseInput(noteInput, note);
  await db.transaction(async (tx) => {
    const { conversion } = await lockHeld(tx, conversionId);
    await tx
      .update(conversions)
      .set({ status: 'rejected', reasons: [...conversion.reasons, 'manual_review'] })
      .where(eq(conversions.id, conversionId));
    await audit(tx, actor.id, 'conversion.reject', 'conversion', conversionId, { note: reason });
  });
}

export async function listConversions(db: Db, filter: { status?: string; campaignId?: string; limit?: number } = {}) {
  const where: SQL[] = [];
  if (filter.status) where.push(eq(conversions.status, filter.status as (typeof conversions.$inferSelect)['status']));
  if (filter.campaignId) where.push(eq(conversions.campaignId, filter.campaignId));
  return db
    .select({ conversion: conversions, campaignName: campaigns.name, advertiserName: organizations.name, event: campaignTasks.mmpEventName })
    .from(conversions)
    .innerJoin(campaigns, eq(campaigns.id, conversions.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(conversions.createdAt))
    .limit(filter.limit ?? 200);
}

export async function listPublisherPostbacks(db: Db, status: 'pending' | 'sent' | 'failed', limit = 200) {
  return db.select().from(publisherPostbacks).where(eq(publisherPostbacks.status, status)).orderBy(desc(publisherPostbacks.createdAt)).limit(limit);
}

export async function resendPublisherPostback(db: Db, actor: AdminUser, id: string): Promise<void> {
  requirePermission(actor, 'review');
  await db.transaction(async (tx) => {
    await retryFailedPostback(tx, id);
    await audit(tx, actor.id, 'publisher_postback.resend', 'publisher_postback', id);
  });
}

export async function listRawPostbacks(db: Db, limit = 100) {
  return db.select().from(postbacksRaw).orderBy(desc(postbacksRaw.receivedAt)).limit(limit);
}

/** Headline numbers for the dashboard, for the last `days` days. */
export async function dashboardStats(db: Db, days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [row] = await db
    .select({
      approved: sql<string>`count(*) filter (where ${conversions.status} = 'approved')`,
      held: sql<string>`count(*) filter (where ${conversions.status} = 'held')`,
      rejected: sql<string>`count(*) filter (where ${conversions.status} = 'rejected')`,
      reversed: sql<string>`count(*) filter (where ${conversions.status} = 'reversed')`,
      spend: sql<string>`coalesce(sum(${conversions.advertiserPrice}) filter (where ${conversions.status} = 'approved'), 0)`,
      publisherPayout: sql<string>`coalesce(sum(${conversions.publisherPayout}) filter (where ${conversions.status} = 'approved'), 0)`,
    })
    .from(conversions)
    .where(gte(conversions.createdAt, since));
  const [holdQueue] = await db.select({ n: sql<string>`count(*)` }).from(conversions).where(eq(conversions.status, 'held'));
  const [failed] = await db.select({ n: sql<string>`count(*)` }).from(publisherPostbacks).where(eq(publisherPostbacks.status, 'failed'));
  const [activeCampaigns] = await db.select({ n: sql<string>`count(*)` }).from(campaigns).where(eq(campaigns.status, 'active'));
  const spend = BigInt(row!.spend);
  const publisherPayout = BigInt(row!.publisherPayout);
  return {
    approved: Number(row!.approved),
    held: Number(row!.held),
    rejected: Number(row!.rejected),
    reversed: Number(row!.reversed),
    spend,
    publisherPayout,
    revenue: spend - publisherPayout,
    holdQueue: Number(holdQueue!.n),
    failedPostbacks: Number(failed!.n),
    activeCampaigns: Number(activeCampaigns!.n),
  };
}

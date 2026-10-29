import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { formatMicros } from '@kiqro/core';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { verifyStripeSignature } from './billing/stripe.ts';
import { MAX_ATTEMPTS, retryDelayMs } from './outbox.ts';

const { campaignTasks, clicks, conversions, webhookDeliveries, webhookEndpoints } = schema;

/** Events advertisers can subscribe to. */
export const WEBHOOK_EVENTS = [
  'conversion.approved',
  'conversion.reversed',
  'claim.created',
  'claim.decided',
  'payment.succeeded',
  'invoice.issued',
  'balance.low',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const LEASE_MS = 10 * 60_000;
const TIMEOUT_MS = 10_000;

/**
 * Queues an event for every active endpoint of the advertiser that subscribes to it. Call
 * inside the transaction of the change, so a rolled-back change never notifies anyone.
 */
export async function emitWebhook(db: DbOrTx, orgId: string, event: WebhookEvent, data: Record<string, unknown>, now = new Date()): Promise<void> {
  const endpoints = await db
    .select({ id: webhookEndpoints.id, events: webhookEndpoints.events })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), isNull(webhookEndpoints.disabledAt)));
  const targets = endpoints.filter((e) => e.events.includes(event) || e.events.includes('*'));
  if (!targets.length) return;
  await db.insert(webhookDeliveries).values(
    targets.map((e) => {
      const id = newId('delivery');
      return { id, endpointId: e.id, event, payload: { id, type: event, created: now.toISOString(), data }, nextAttemptAt: now, createdAt: now };
    }),
  );
}

/** Public fields of a conversion for webhook payloads. */
export async function conversionEventData(db: DbOrTx, conversionId: string): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ c: conversions, event: campaignTasks.mmpEventName, country: clicks.country })
    .from(conversions)
    .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
    .innerJoin(clicks, eq(clicks.id, conversions.clickId))
    .where(eq(conversions.id, conversionId));
  if (!row) return { conversion_id: conversionId };
  return {
    conversion_id: row.c.id,
    click_id: row.c.clickId,
    campaign_id: row.c.campaignId,
    event: row.event,
    country: row.country,
    price_usd: formatMicros(row.c.advertiserPrice),
    status: row.c.status,
    event_at: row.c.eventAt.toISOString(),
    reason: row.c.reversalReason,
  };
}

/** Signature header value: "t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>". */
export function signWebhook(body: string, secret: string, now = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

/** Verifies a `Kiqro-Signature` header (same scheme as Stripe's), with a 5-minute tolerance. */
export const verifyWebhookSignature = verifyStripeSignature;

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString('base64url')}`;

/**
 * Accepts only public HTTPS endpoints: no plain HTTP, localhost, or private / link-local IP
 * literals, so a webhook cannot be pointed at Kiqro's internal network.
 */
export function isAllowedWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  const v = isIP(host);
  if (v === 4) {
    const [a, b] = host.split('.').map(Number) as [number, number];
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (v === 6) return !(host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:'));
  return host.includes('.');
}

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: 'manual' }) => Promise<{ status: number }>;

/** Sends due webhook deliveries; returns how many were attempted. */
export async function deliverDueWebhooks(db: Db, fetcher: Fetcher = fetch as unknown as Fetcher, now = new Date(), batchSize = 50): Promise<number> {
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ d: webhookDeliveries, url: webhookEndpoints.url, secret: webhookEndpoints.secret })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .where(and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextAttemptAt, now)))
      .orderBy(asc(webhookDeliveries.nextAttemptAt))
      .limit(batchSize)
      .for('update', { of: webhookDeliveries, skipLocked: true });
    if (rows.length) {
      await tx
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
        .where(inArray(webhookDeliveries.id, rows.map((r) => r.d.id)));
    }
    return rows;
  });

  for (const { d, url, secret } of due) {
    const body = JSON.stringify(d.payload);
    const attempts = d.attempts + 1;
    let status: number | null = null;
    let error: string | null = null;
    if (!isAllowedWebhookUrl(url)) {
      error = 'endpoint URL not allowed';
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetcher(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'KiqroNetwork-Webhooks/1.0', 'kiqro-event': d.event, 'kiqro-signature': signWebhook(body, secret, now) },
          body,
          signal: controller.signal,
          redirect: 'manual',
        });
        status = res.status;
        if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        clearTimeout(timer);
      }
    }
    await db
      .update(webhookDeliveries)
      .set(
        error === null
          ? { status: 'sent', attempts, sentAt: now, responseStatus: status, lastError: null }
          : {
              attempts,
              responseStatus: status,
              lastError: error.slice(0, 300),
              status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
            },
      )
      .where(eq(webhookDeliveries.id, d.id));
  }
  return due.length;
}

/** Recent deliveries of the advertiser's endpoints, for the panel. */
export async function recentWebhookDeliveries(db: Db, orgId: string, limit = 30) {
  return db
    .select({
      id: webhookDeliveries.id,
      event: webhookDeliveries.event,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      responseStatus: webhookDeliveries.responseStatus,
      lastError: webhookDeliveries.lastError,
      createdAt: webhookDeliveries.createdAt,
      url: webhookEndpoints.url,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(eq(webhookEndpoints.orgId, orgId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

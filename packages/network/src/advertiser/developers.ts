import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { translateMessage, type FieldIssue, type UiLocale } from '../validation.ts';
import { isAllowedWebhookUrl, newWebhookSecret, WEBHOOK_EVENTS } from '../webhooks.ts';
import type { AdvertiserSession } from './auth.ts';

const { advertiserApiKeys, advertiserUsers, auditLog, organizations, webhookDeliveries, webhookEndpoints } = schema;

export type DevResult<T = object> = ({ ok: true } & T) | { ok: false; issues: FieldIssue[] };
const fail = (key: string, locale: UiLocale, path = ''): { ok: false; issues: FieldIssue[] } => ({ ok: false, issues: [{ path, message: translateMessage(key, locale) }] });

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const MAX_KEYS = 10;
const MAX_ENDPOINTS = 5;

async function auditDev(db: DbOrTx, session: AdvertiserSession, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ id: newId('audit'), adminUserId: null, action, entityType, entityId, details: { ...details, advertiserUserId: session.user.id, orgId: session.org.id } });
}

// ---------- API keys ----------

/** Creates an API key; the full key is returned once and never stored. Team admins only. */
export async function createApiKey(db: Db, session: AdvertiserSession, name: string, locale: UiLocale): Promise<DevResult<{ key: string }>> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  const label = name.trim();
  if (label.length < 2 || label.length > 60) return fail('name_short', locale, 'name');
  const active = await db.select({ id: advertiserApiKeys.id }).from(advertiserApiKeys).where(and(eq(advertiserApiKeys.orgId, session.org.id), isNull(advertiserApiKeys.revokedAt)));
  if (active.length >= MAX_KEYS) return fail('too_many_keys', locale);
  const key = `kq_live_${randomBytes(30).toString('base64url')}`;
  const id = newId('apiKey');
  await db.transaction(async (tx) => {
    await tx.insert(advertiserApiKeys).values({ id, orgId: session.org.id, name: label, prefix: key.slice(0, 14), keyHash: hashKey(key), createdBy: session.user.id });
    await auditDev(tx, session, 'advertiser.api_key.create', 'api_key', id, { name: label });
  });
  return { ok: true, key };
}

export async function listApiKeys(db: Db, orgId: string) {
  return db
    .select({ id: advertiserApiKeys.id, name: advertiserApiKeys.name, prefix: advertiserApiKeys.prefix, lastUsedAt: advertiserApiKeys.lastUsedAt, createdAt: advertiserApiKeys.createdAt, createdBy: advertiserUsers.name })
    .from(advertiserApiKeys)
    .innerJoin(advertiserUsers, eq(advertiserUsers.id, advertiserApiKeys.createdBy))
    .where(and(eq(advertiserApiKeys.orgId, orgId), isNull(advertiserApiKeys.revokedAt)))
    .orderBy(desc(advertiserApiKeys.createdAt));
}

export async function revokeApiKey(db: Db, session: AdvertiserSession, keyId: string, locale: UiLocale, now = new Date()): Promise<DevResult> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  const updated = await db
    .update(advertiserApiKeys)
    .set({ revokedAt: now })
    .where(and(eq(advertiserApiKeys.id, keyId), eq(advertiserApiKeys.orgId, session.org.id), isNull(advertiserApiKeys.revokedAt)))
    .returning({ id: advertiserApiKeys.id });
  if (!updated.length) return fail('not_found', locale);
  await auditDev(db, session, 'advertiser.api_key.revoke', 'api_key', keyId);
  return { ok: true };
}

/**
 * Resolves a bearer key to the advertiser session of the teammate who created it. Revoked keys,
 * removed teammates and suspended advertisers are refused.
 */
export async function authenticateApiKey(db: Db, key: string | undefined, now = new Date()): Promise<AdvertiserSession | null> {
  if (!key?.startsWith('kq_live_')) return null;
  const [row] = await db
    .select({ key: advertiserApiKeys, user: advertiserUsers, org: organizations })
    .from(advertiserApiKeys)
    .innerJoin(advertiserUsers, eq(advertiserUsers.id, advertiserApiKeys.createdBy))
    .innerJoin(organizations, eq(organizations.id, advertiserApiKeys.orgId))
    .where(and(eq(advertiserApiKeys.keyHash, hashKey(key)), isNull(advertiserApiKeys.revokedAt), isNull(advertiserUsers.disabledAt), eq(organizations.status, 'active')));
  if (!row) return null;
  // Record use at most once a minute, not on every request.
  if (!row.key.lastUsedAt || now.getTime() - row.key.lastUsedAt.getTime() > 60_000) {
    await db.update(advertiserApiKeys).set({ lastUsedAt: now }).where(eq(advertiserApiKeys.id, row.key.id));
  }
  return { user: row.user, org: row.org };
}

// ---------- Webhook endpoints ----------

/** Adds a webhook endpoint; returns its signing secret. Team admins only. */
export async function createWebhookEndpoint(db: Db, session: AdvertiserSession, input: { url: string; events: string[] }, locale: UiLocale): Promise<DevResult<{ id: string; secret: string }>> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  const url = input.url.trim();
  if (!isAllowedWebhookUrl(url)) return fail('webhook_url', locale, 'url');
  const events = [...new Set(input.events)].filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (!events.length) return fail('webhook_events', locale, 'events');
  const active = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.orgId, session.org.id), isNull(webhookEndpoints.disabledAt)));
  if (active.length >= MAX_ENDPOINTS) return fail('too_many_endpoints', locale);
  const id = newId('webhook');
  const secret = newWebhookSecret();
  await db.transaction(async (tx) => {
    await tx.insert(webhookEndpoints).values({ id, orgId: session.org.id, url, secret, events });
    await auditDev(tx, session, 'advertiser.webhook.create', 'webhook_endpoint', id, { url, events });
  });
  return { ok: true, id, secret };
}

export async function listWebhookEndpoints(db: Db, orgId: string) {
  return db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), isNull(webhookEndpoints.disabledAt)))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export async function removeWebhookEndpoint(db: Db, session: AdvertiserSession, endpointId: string, locale: UiLocale, now = new Date()): Promise<DevResult> {
  if (session.user.role !== 'admin') return fail('team_admin_only', locale);
  const updated = await db
    .update(webhookEndpoints)
    .set({ disabledAt: now })
    .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.orgId, session.org.id), isNull(webhookEndpoints.disabledAt)))
    .returning({ id: webhookEndpoints.id });
  if (!updated.length) return fail('not_found', locale);
  await auditDev(db, session, 'advertiser.webhook.remove', 'webhook_endpoint', endpointId);
  return { ok: true };
}

/** Queues a "ping" event to one endpoint, so the advertiser can test their receiver. */
export async function sendTestWebhook(db: Db, session: AdvertiserSession, endpointId: string, locale: UiLocale, now = new Date()): Promise<DevResult> {
  const endpoint = await db.query.webhookEndpoints.findFirst({ where: and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.orgId, session.org.id), isNull(webhookEndpoints.disabledAt)) });
  if (!endpoint) return fail('not_found', locale);
  const id = newId('delivery');
  await db.insert(webhookDeliveries).values({ id, endpointId, event: 'ping', payload: { id, type: 'ping', created: now.toISOString(), data: { message: 'Kiqro Network test event' } }, nextAttemptAt: now, createdAt: now });
  return { ok: true };
}

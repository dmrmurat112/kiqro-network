'use server';

import { revalidatePath } from 'next/cache';
import type { FieldIssue } from '@kiqro/network';
import { createApiKey, createWebhookEndpoint, removeWebhookEndpoint, revokeApiKey, sendTestWebhook } from '@kiqro/network/advertiser';
import { db } from '@/lib/db';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';

export type DevState = { ok?: boolean; key?: string; secret?: string; issues?: FieldIssue[] } | undefined;

const done = (result: { ok: true } | { ok: false; issues: FieldIssue[] }, extra: Partial<DevState> = {}): DevState => {
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/developers');
  return { ok: true, ...extra };
};

export async function createKeyAction(_: DevState, form: FormData): Promise<DevState> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const result = await createApiKey(db, session, String(form.get('name') ?? ''), lang);
  return done(result, result.ok ? { key: result.key } : {});
}

export async function addEndpointAction(_: DevState, form: FormData): Promise<DevState> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const result = await createWebhookEndpoint(db, session, { url: String(form.get('url') ?? ''), events: form.getAll('events').map(String) }, lang);
  return done(result, result.ok ? { secret: result.secret } : {});
}

/** Revoke a key, remove an endpoint or send a test event. */
export async function devItemAction(op: 'revoke' | 'remove' | 'test', id: string): Promise<DevState> {
  const [session, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const result =
    op === 'revoke' ? await revokeApiKey(db, session, id, lang) : op === 'remove' ? await removeWebhookEndpoint(db, session, id, lang) : await sendTestWebhook(db, session, id, lang);
  return done(result);
}

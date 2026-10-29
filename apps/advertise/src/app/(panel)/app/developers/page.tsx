import { KeyRound, Webhook } from 'lucide-react';
import { recentWebhookDeliveries, WEBHOOK_EVENTS } from '@kiqro/network';
import { listApiKeys, listWebhookEndpoints } from '@kiqro/network/advertiser';
import { Card, Empty, PageHeader, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';
import { AddEndpointForm, CreateKeyForm, ItemButton, SecretReveal } from './DevClient';

export const dynamic = 'force-dynamic';

const PILL: Record<string, string> = { sent: 'active', pending: 'in_review', failed: 'refunded' };

export default async function DevelopersPage() {
  const [{ org, user }, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const t = PANEL[lang].developers;
  const c = PANEL[lang].integration;
  const copy = { copy: c.copy, copied: c.copied };
  const [keys, endpoints, deliveries] = await Promise.all([listApiKeys(db, org.id), listWebhookEndpoints(db, org.id), recentWebhookDeliveries(db, org.id)]);
  const admin = user.role === 'admin';
  const base = `${process.env.TRACKING_BASE_URL ?? 'https://track.kiqro.com'}/v1/advertiser`;

  return (
    <>
      <PageHeader title={t.title} sub={t.sub} />

      <Card className="mb-4 p-6">
        <h2 className="mb-3 font-semibold">{t.quickstart}</h2>
        <pre className="overflow-x-auto rounded-xl border border-line bg-bg p-4 font-mono text-[0.8rem] leading-relaxed text-fg/90">
          {`curl ${base}/campaigns \\\n  -H "Authorization: Bearer kq_live_…"`}
        </pre>
        <p className="mt-3 text-sm text-muted">
          {t.baseUrl}: <code className="font-mono text-xs">{base}</code> · GET /me · /campaigns · /stats?days=30 · /conversions · /claims · POST /campaigns/:id/pause|resume · /claims/:id/approve|reject
        </p>
        <p className="mt-1 text-sm text-subtle">{t.docs}</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-1 flex items-center gap-2">
            <KeyRound size={17} className="text-violet-400" />
            <h2 className="font-semibold">{t.keys}</h2>
          </div>
          <p className="mb-4 text-sm text-muted">{t.keysSub}</p>
          {keys.length === 0 ? (
            <p className="mb-4 text-sm text-subtle">{t.noKeys}</p>
          ) : (
            <ul className="mb-4 divide-y divide-line rounded-xl border border-line">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-subtle">
                      <code className="font-mono">{k.prefix}…</code> · {t.createdBy} {k.createdBy} · {t.lastUsed}: {k.lastUsedAt ? dateTime(k.lastUsedAt, lang) : t.never}
                    </div>
                  </div>
                  {admin && <ItemButton op="revoke" id={k.id} label={t.revoke} confirm={t.revokeConfirm} danger />}
                </li>
              ))}
            </ul>
          )}
          {admin ? <CreateKeyForm t={t} c={copy} /> : <p className="text-sm text-subtle">{t.adminOnly}</p>}
        </Card>

        <Card className="p-6">
          <div className="mb-1 flex items-center gap-2">
            <Webhook size={17} className="text-violet-400" />
            <h2 className="font-semibold">{t.webhooks}</h2>
          </div>
          <p className="mb-4 text-sm text-muted">{t.webhooksSub}</p>
          {endpoints.length === 0 ? (
            <p className="mb-4 text-sm text-subtle">{t.noEndpoints}</p>
          ) : (
            <ul className="mb-4 grid gap-3">
              {endpoints.map((e) => (
                <li key={e.id} className="grid gap-2 rounded-xl border border-line p-3 text-sm">
                  <code className="font-mono text-xs break-all">{e.url}</code>
                  <div className="flex flex-wrap gap-1">
                    {e.events.map((ev) => (
                      <span key={ev} className="rounded-full bg-surface-strong px-2 py-0.5 text-[0.7rem] text-muted">
                        {ev}
                      </span>
                    ))}
                  </div>
                  {admin && <SecretReveal secret={e.secret} t={t} c={copy} />}
                  <div className="flex flex-wrap justify-end gap-1">
                    <ItemButton op="test" id={e.id} label={t.test} doneLabel={t.testSent} />
                    {admin && <ItemButton op="remove" id={e.id} label={t.remove} confirm={t.removeConfirm} danger />}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {admin ? <AddEndpointForm t={t} c={copy} events={WEBHOOK_EVENTS} /> : <p className="text-sm text-subtle">{t.adminOnly}</p>}
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">{t.deliveries}</h2>
        </div>
        {deliveries.length === 0 ? (
          <Empty>{t.noDeliveries}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap">{dateTime(d.createdAt, lang)}</td>
                    <td className="px-5 py-3 font-mono text-xs">{d.event}</td>
                    <td className="max-w-[16rem] truncate px-5 py-3 font-mono text-xs text-subtle">{d.url}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={PILL[d.status] ?? d.status} label={t.statuses[d.status] ?? d.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-subtle">
                      {d.responseStatus ? `HTTP ${d.responseStatus}` : ''} {d.lastError && d.status !== 'sent' ? `· ${d.lastError}` : ''} {d.attempts > 1 ? `· ×${d.attempts}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

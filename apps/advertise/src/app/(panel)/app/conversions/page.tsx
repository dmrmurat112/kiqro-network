import { Download } from 'lucide-react';
import { advertiserCampaigns, advertiserConversions, type PublicStatus } from '@kiqro/network/advertiser';
import { Card, Empty, PageHeader, Segmented, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';

export const dynamic = 'force-dynamic';

const STATUSES: PublicStatus[] = ['billed', 'not_billed', 'in_review', 'refunded'];

export default async function ConversionsPage({ searchParams }: { searchParams: Promise<{ status?: string; campaign?: string }> }) {
  const [{ org }, lang, sp] = await Promise.all([requireAdvertiserOrg(), panelLocale(), searchParams]);
  const t = PANEL[lang].conversions;
  const status = STATUSES.find((s) => s === sp.status);
  const campaigns = await advertiserCampaigns(db, org.id);
  // Only accept campaign ids that belong to this advertiser.
  const campaignId = campaigns.some((c) => c.id === sp.campaign) ? sp.campaign : undefined;
  const rows = await advertiserConversions(db, org.id, { status, campaignId, limit: 200 });

  const query = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, campaign: campaignId, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : '';
  };

  return (
    <>
      <PageHeader title={t.title} sub={t.sub}>
        <a href={`/app/conversions/export${query({})}`} className="btn-ghost !py-2 text-sm">
          <Download size={15} /> {t.export}
        </a>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={status ?? 'all'}
          options={[
            { value: 'all', label: t.all, href: `/app/conversions${query({ status: undefined })}` },
            ...STATUSES.map((s) => ({ value: s, label: t.statuses[s]!, href: `/app/conversions${query({ status: s })}` })),
          ]}
        />
        {campaigns.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <a href={`/app/conversions${query({ campaign: undefined })}`} className={`rounded-lg px-3 py-1.5 text-sm ${!campaignId ? 'bg-surface-strong text-fg' : 'text-muted hover:text-fg'}`}>
              {t.all}
            </a>
            {campaigns.map((c) => (
              <a key={c.id} href={`/app/conversions${query({ campaign: c.id })}`} className={`rounded-lg px-3 py-1.5 text-sm ${campaignId === c.id ? 'bg-surface-strong text-fg' : 'text-muted hover:text-fg'}`}>
                {c.name}
              </a>
            ))}
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty>{t.empty}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-5 py-3 font-medium">{t.time}</th>
                  <th className="px-5 py-3 font-medium">{t.campaign}</th>
                  <th className="px-5 py-3 font-medium">{t.event}</th>
                  <th className="px-5 py-3 font-medium">{t.country}</th>
                  <th className="px-5 py-3 font-medium">{t.status}</th>
                  <th className="px-5 py-3 text-right font-medium">{t.billed}</th>
                  <th className="px-5 py-3 font-medium">{t.clickId}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-strong">
                    <td className="px-5 py-3 whitespace-nowrap text-muted">{dateTime(r.createdAt, lang)}</td>
                    <td className="px-5 py-3">{r.campaignName}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.event}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{r.country ?? '—'}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={r.status} label={t.statuses[r.status]!} />
                      {r.reason && <div className="mt-1 text-xs text-subtle">{t.reasons[r.reason] ?? r.reason}</div>}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{r.price > 0n ? usd(r.price, lang) : '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-subtle">{r.clickId}</td>
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

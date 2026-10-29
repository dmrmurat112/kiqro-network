import { MessageSquareWarning } from 'lucide-react';
import { listClaims } from '@kiqro/network';
import { Card, Empty, PageHeader, Segmented, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { countryName, dateTime } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';
import { CopyField } from '@/components/panel/CopyField';
import { ClaimDecision } from './ClaimDecision';

export const dynamic = 'force-dynamic';

const PILL: Record<string, string> = { open: 'in_review', approved: 'active', rejected: 'refunded' };

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ org }, lang, sp] = await Promise.all([requireAdvertiserOrg(), panelLocale(), searchParams]);
  const t = PANEL[lang].claims;
  const tab = sp.tab === 'decided' ? 'decided' : 'open';
  const all = await listClaims(db, { orgId: org.id });
  const rows = all.filter((c) => (tab === 'open' ? c.status === 'open' : c.status !== 'open'));
  const openCount = all.filter((c) => c.status === 'open').length;

  return (
    <>
      <PageHeader title={t.title} sub={t.sub}>
        <Segmented
          value={tab}
          options={[
            { value: 'open', label: `${t.open}${openCount ? ` · ${openCount}` : ''}`, href: '/app/claims' },
            { value: 'decided', label: t.decided, href: '/app/claims?tab=decided' },
          ]}
        />
      </PageHeader>

      {rows.length === 0 ? (
        <Card>
          <Empty>{tab === 'open' ? t.empty : t.emptyDecided}</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {rows.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.campaignName}</span>
                    <span className="text-subtle">·</span>
                    <span>{c.taskName[lang] ?? c.taskName.en ?? c.taskEvent}</span>
                    <StatusPill status={PILL[c.status] ?? c.status} label={t.statuses[c.status] ?? c.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <Item label={t.user} value={<span className="font-mono text-xs">{c.publisherUserId}</span>} />
                    <Item label={t.clicked} value={`${dateTime(c.clickedAt, lang)}${c.country ? ` · ${countryName(c.country, lang)}` : ''}`} />
                    <Item label={t.claimed} value={dateTime(c.createdAt, lang)} />
                    <Item label={t.step} value={<span className="font-mono text-xs">{c.taskEvent}</span>} />
                  </dl>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="mb-1 text-xs text-subtle">{t.clickId}</div>
                    <CopyField value={c.clickId} copyLabel={PANEL[lang].integration.copy} copiedLabel={PANEL[lang].integration.copied} />
                  </div>
                  {c.userNote && (
                    <div className="flex items-start gap-2 rounded-xl bg-surface-strong px-3 py-2.5 text-sm">
                      <MessageSquareWarning size={16} className="mt-0.5 shrink-0 text-subtle" />
                      <span>
                        <span className="text-subtle">{t.userNote}: </span>
                        {c.userNote}
                      </span>
                    </div>
                  )}
                  {c.decisionNote && c.status !== 'open' && <div className="text-sm text-muted">→ {c.decisionNote}</div>}
                </div>
                {c.status === 'open' && <ClaimDecision claimId={c.id} t={t} />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}

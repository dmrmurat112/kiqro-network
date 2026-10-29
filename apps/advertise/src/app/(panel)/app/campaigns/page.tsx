import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, Pause, Pencil, Play, Plus, Send } from 'lucide-react';
import { advertiserCampaigns } from '@kiqro/network/advertiser';
import { Card, Empty, PageHeader, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { num, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiser } from '@/lib/session';
import { setPausedAction, submitCampaignAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ saved?: string; submitted?: string }> }) {
  const [{ org }, lang, sp] = await Promise.all([requireAdvertiser(), panelLocale(), searchParams]);
  const t = PANEL[lang].campaigns;
  const campaigns = await advertiserCampaigns(db, org.id);

  return (
    <>
      <PageHeader title={t.title}>
        <Link href="/app/campaigns/new" className="btn-primary !py-2 text-sm">
          <Plus size={16} /> {t.new}
        </Link>
      </PageHeader>
      {(sp.saved || sp.submitted) && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-good/30 bg-good/8 px-4 py-3 text-sm text-good">
          <CheckCircle2 size={16} /> {sp.submitted ? t.submitted : t.saved}
        </div>
      )}
      {campaigns.length === 0 ? (
        <Card>
          <Empty>{t.empty}</Empty>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {
            const used = c.totalBudget > 0n ? Math.min(100, Number((c.spend * 1000n) / c.totalBudget) / 10) : 0;
            const top = Math.max(c.clicks, ...c.tasks.map((x) => x.completions), 1);
            return (
              <Card key={c.id} className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-semibold">{c.name}</h2>
                      <StatusPill status={c.status} label={t.status[c.status] ?? c.status} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      <span>{c.productName}</span>
                      <span className="text-subtle">·</span>
                      <span className="capitalize">{c.platform}</span>
                      <span className="text-subtle">·</span>
                      <span className="flex gap-1">{c.countries.map((code) => <span key={code} className="rounded-md border border-line px-1.5 py-px font-mono text-[0.7rem] text-muted">{code}</span>)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {c.status === 'draft' && (
                        <>
                          <Link href={`/app/campaigns/${c.id}/edit`} className="btn-ghost !py-1.5 text-sm">
                            <Pencil size={14} /> {t.edit}
                          </Link>
                          <form action={submitCampaignAction.bind(null, c.id)}>
                            <button className="btn-primary !py-1.5 text-sm">
                              <Send size={14} /> {t.submit}
                            </button>
                          </form>
                        </>
                      )}
                      {(c.status === 'active' || c.status === 'paused') && (
                        <form action={setPausedAction.bind(null, c.id, c.status === 'active')}>
                          <button className="btn-ghost !py-1.5 text-sm">
                            {c.status === 'active' ? <Pause size={14} /> : <Play size={14} />} {c.status === 'active' ? t.pause : t.resume}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="min-w-56 sm:text-right">
                    <div className="text-xs text-subtle">{t.budget}</div>
                    <div className="mt-1 font-mono text-sm tabular-nums">
                      {usd(c.spend, lang)} <span className="text-subtle">/ {usd(c.totalBudget, lang)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-orange-400" style={{ width: `${used}%` }} />
                    </div>
                  </div>
                </div>

                {c.status === 'draft' && c.reviewNote && (
                  <div className="mt-5 rounded-xl border border-warn/30 bg-warn/8 p-4 text-sm">
                    <div className="flex items-center gap-2 font-semibold text-warn">
                      <AlertCircle size={16} /> {t.returnedTitle}
                    </div>
                    <p className="mt-1.5 whitespace-pre-line">{c.reviewNote}</p>
                  </div>
                )}
                {c.status === 'draft' && !c.reviewNote && <p className="mt-5 text-sm text-muted">{t.draftNote}</p>}
                {c.status === 'in_review' && (
                  <p className="mt-5 flex items-center gap-2 text-sm text-warn">
                    <Clock size={15} /> {t.inReviewNote}
                  </p>
                )}
                <div className="mt-6">
                  <div className="mb-3 text-xs font-medium uppercase tracking-wider text-subtle">{t.funnel}</div>
                  <div className="grid gap-2.5">
                    <FunnelRow label={t.clicks} value={num(c.clicks, lang)} pct={(c.clicks / top) * 100} muted />
                    {c.tasks.map((task) => (
                      <FunnelRow
                        key={task.seq}
                        label={`${task.seq}. ${task.name}`}
                        sub={task.event}
                        value={`${num(task.completions, lang)} ${t.completions}`}
                        extra={usd(task.spend, lang)}
                        pct={(task.completions / top) * 100}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-5 text-right">
                  <Link href={`/app/conversions?campaign=${c.id}`} className="text-sm font-medium text-violet-400 hover:text-violet-300">
                    {PANEL[lang].conversions.title} →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function FunnelRow({ label, sub, value, extra, pct, muted }: { label: string; sub?: string; value: string; extra?: string; pct: number; muted?: boolean }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,15rem)_1fr_15rem]">
      <div className="truncate">
        {label}
        {sub && <span className="ml-2 font-mono text-xs text-subtle">{sub}</span>}
      </div>
      <div className="h-7 overflow-hidden rounded-lg bg-surface-strong">
        <div
          className={`h-full rounded-lg ${muted ? 'bg-line-strong' : 'bg-gradient-to-r from-violet-500/80 to-violet-400/60'}`}
          style={{ width: `${Math.max(pct, 1.5)}%` }}
        />
      </div>
      <div className="font-mono text-xs tabular-nums sm:text-right">
        {value}
        {extra && <span className="ml-2 text-subtle">{extra}</span>}
      </div>
    </div>
  );
}

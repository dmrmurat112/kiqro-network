import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { placementStats, publisherPlacements } from '@kiqro/network/publisher';
import { Card, PageHeader, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { num, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';
import { PlacementIcon, TypeBadge, TypeIcon, storeLabel } from './shared';

export const dynamic = 'force-dynamic';

export default async function PlacementsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [{ org, user }, lang, sp] = await Promise.all([requirePublisherOrg(), panelLocale(), searchParams]);
  const t = PANEL[lang].pub;
  const p = t.pl;
  const list = await publisherPlacements(db, org.id);
  const stats = await placementStats(db, list.map((x) => x.id), 7);
  const date = (d: Date) => d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const canEdit = user.role === 'admin';

  return (
    <>
      <PageHeader title={t.placementsTitle} sub={p.listSub}>
        {canEdit && (
          <Link href="/app/publisher/placements/new" className="btn-primary !py-2 text-sm whitespace-nowrap">
            <Plus size={16} /> {p.add}
          </Link>
        )}
      </PageHeader>
      {sp.deleted && <p className="mb-4 rounded-xl border border-good/30 bg-good/10 px-4 py-2.5 text-sm text-good">{p.deleted}</p>}

      {list.length === 0 ? (
        <Card className="grid place-items-center gap-3 px-6 py-16 text-center">
          <div className="flex gap-2 text-violet-300">
            {(['android', 'ios', 'web', 'api'] as const).map((ty) => (
              <span key={ty} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-strong">
                <TypeIcon type={ty} />
              </span>
            ))}
          </div>
          <h2 className="mt-2 text-lg font-semibold">{p.emptyTitle}</h2>
          <p className="max-w-md text-sm text-muted">{p.emptySub}</p>
          {canEdit && (
            <Link href="/app/publisher/placements/new" className="btn-primary mt-2 !py-2 text-sm">
              <Plus size={16} /> {p.add}
            </Link>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop: table. */}
          <table className="hidden w-full text-sm xl:table">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th className="px-5 py-3 font-medium">{p.cols.placement}</th>
                <th className="px-3 py-3 text-right font-medium">{p.cols.users}</th>
                <th className="px-3 py-3 text-right font-medium">{p.cols.clicks}</th>
                <th className="px-3 py-3 text-right font-medium">{p.cols.rewards}</th>
                <th className="px-3 py-3 text-right font-medium">{p.cols.earnings}</th>
                <th className="px-3 py-3 font-medium">{p.cols.created}</th>
                <th className="px-3 py-3 font-medium">{p.cols.status}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {list.map((x) => {
                const s = stats.get(x.id)!;
                return (
                  <tr key={x.id} className="group border-b border-line last:border-0 transition-colors hover:bg-surface-strong/50">
                    <td className="px-5 py-3.5">
                      <Link href={`/app/publisher/placements/${x.id}`} className="flex min-w-0 items-center gap-3">
                        <PlacementIcon type={x.type} iconUrl={x.iconUrl} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:text-violet-300">{x.name}</span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <TypeBadge type={x.type} label={p.types[x.type] ?? x.type} />
                            {x.storeUrl && <span className="truncate font-mono text-xs text-subtle">{storeLabel(x.storeUrl)}</span>}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{num(s.users, lang)}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{num(s.clicks, lang)}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{num(s.conversions, lang)}</td>
                    <td className="px-3 py-3.5 text-right font-medium tabular-nums">{usd(s.earnings, lang)}</td>
                    <td className="px-3 py-3.5 text-muted">{date(x.createdAt)}</td>
                    <td className="px-3 py-3.5">
                      <StatusPill status={x.status === 'active' ? 'active' : 'paused'} label={t.status[x.status] ?? x.status} />
                    </td>
                    <td className="pr-4">
                      <Link href={`/app/publisher/placements/${x.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-surface-strong hover:text-fg" aria-label={p.edit}>
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile and tablet: cards. */}
          <ul className="divide-y divide-line xl:hidden">
            {list.map((x) => {
              const s = stats.get(x.id)!;
              return (
                <li key={x.id}>
                  <Link href={`/app/publisher/placements/${x.id}`} className="block p-4 transition-colors hover:bg-surface-strong/50">
                    <div className="flex items-center gap-3">
                      <PlacementIcon type={x.type} iconUrl={x.iconUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{x.name}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <TypeBadge type={x.type} label={p.types[x.type] ?? x.type} />
                          <StatusPill status={x.status === 'active' ? 'active' : 'paused'} label={t.status[x.status] ?? x.status} />
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-subtle" />
                    </div>
                    <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                      {[
                        [p.cols.users, num(s.users, lang)],
                        [p.cols.clicks, num(s.clicks, lang)],
                        [p.cols.rewards, num(s.conversions, lang)],
                        [p.cols.earnings, usd(s.earnings, lang)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-surface-strong/60 px-1 py-1.5">
                          <dt className="text-[0.68rem] text-subtle">{k}</dt>
                          <dd className="text-sm font-medium tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

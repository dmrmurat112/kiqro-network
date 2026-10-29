import Link from 'next/link';
import { AlertTriangle, LifeBuoy, MousePointerClick, ShieldCheck, Wallet } from 'lucide-react';
import { creditPosition, listClaims } from '@kiqro/network';
import { advertiserCountries, advertiserDailySeries, advertiserOverview } from '@kiqro/network/advertiser';
import { Card, Delta, Empty, PageHeader, Segmented } from '@/components/panel/ui';
import { TrendChart } from '@/components/panel/TrendChart';
import { db } from '@/lib/db';
import { change, countryName, flag, num, shortDate, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const PERIODS = [7, 30, 90] as const;
const LOW_BALANCE_MICROS = 100_000_000n; // $100

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const [{ org }, lang, sp] = await Promise.all([requireAdvertiser(), panelLocale(), searchParams]);
  const t = PANEL[lang];
  const days = PERIODS.find((p) => String(p) === sp.days) ?? 30;

  const [overview, series, countries, credit, openClaims] = await Promise.all([
    advertiserOverview(db, org.id, days),
    advertiserDailySeries(db, org.id, days),
    advertiserCountries(db, org.id, days),
    creditPosition(db, org.id),
    listClaims(db, { orgId: org.id, status: 'open', limit: 100 }),
  ]);
  const { current: c, previous: p } = overview;
  const ecpi = c.installs > 0 ? c.spend / BigInt(c.installs) : 0n;
  const prevEcpi = p.installs > 0 ? p.spend / BigInt(p.installs) : 0n;
  const vs = t.overview.vsPrev;
  const maxCountrySpend = countries.reduce((m, x) => (x.spend > m ? x.spend : m), 1n);

  const kpis = [
    { label: t.overview.spend, value: usd(c.spend, lang), delta: change(Number(c.spend), Number(p.spend)) },
    { label: t.overview.installs, value: num(c.installs, lang), delta: change(c.installs, p.installs) },
    { label: t.overview.events, value: num(c.events, lang), delta: change(c.events, p.events) },
    { label: t.overview.ecpi, value: c.installs ? usd(ecpi, lang) : '—', delta: c.installs && p.installs ? change(Number(ecpi), Number(prevEcpi)) : null, invert: true },
  ];

  return (
    <>
      <PageHeader title={t.overview.title}>
        <Segmented value={String(days)} options={PERIODS.map((d) => ({ value: String(d), label: t.periods[d]!, href: `/app?days=${d}` }))} />
      </PageHeader>

      {(credit.creditSuspended || credit.spendable < LOW_BALANCE_MICROS) && (
        <div className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${credit.creditSuspended ? 'border-bad/30 bg-bad/8' : 'border-warn/30 bg-warn/8'}`}>
          <AlertTriangle size={18} className={`shrink-0 ${credit.creditSuspended ? 'text-bad' : 'text-warn'}`} />
          <span className="flex-1">{credit.creditSuspended ? t.overview.creditSuspended : t.overview.lowBalance}</span>
          <Link href="/app/billing" className="shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400">
            {t.overview.topUp}
          </Link>
        </div>
      )}

      {openClaims.length > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 px-4 py-3 text-sm">
          <LifeBuoy size={18} className="shrink-0 text-violet-400" />
          <span className="flex-1">{t.claims.banner.replace('{n}', String(openClaims.length))}</span>
          <Link href="/app/claims" className="shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400">
            {t.claims.view}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4 sm:p-5">
            <div className="text-sm text-muted">{k.label}</div>
            <div className="mt-2 font-mono text-xl font-semibold tracking-tight tabular-nums sm:text-[1.65rem]">{k.value}</div>
            <div className="mt-2">
              <Delta value={k.delta} label={vs} invert={k.invert} />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{t.overview.chartTitle}</h2>
            <span className="text-xs text-subtle">{t.periods[days]}</span>
          </div>
          <TrendChart
            locale={lang === 'tr' ? 'tr-TR' : 'en-US'}
            labels={{ spend: t.overview.spend, installs: t.overview.installs, events: t.overview.events }}
            points={series.map((s) => ({ label: shortDate(s.date, lang), spend: Number(s.spend) / 1e6, installs: s.installs, events: s.events }))}
          />
        </Card>

        <div className="grid gap-4">
          <Card className="relative overflow-hidden p-5">
            <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative flex items-center justify-between gap-2 text-sm text-muted">
              <span className="flex items-center gap-2">
                <Wallet size={16} className="text-violet-400" /> {credit.creditLimit > 0n ? t.overview.available : t.overview.balance}
              </span>
              <Link href="/app/billing" className="text-xs font-medium text-violet-400 hover:text-violet-300">
                {t.overview.topUp} →
              </Link>
            </div>
            <div className="relative mt-2 font-mono text-3xl font-semibold tracking-tight tabular-nums">{usd(credit.creditLimit > 0n ? (credit.spendable > 0n ? credit.spendable : 0n) : overview.balance, lang)}</div>
            {credit.creditLimit > 0n && <div className="relative mt-1 text-xs text-subtle">{t.overview.creditIncluded}</div>}
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-subtle">{t.overview.activeCampaigns}</div>
                <div className="mt-0.5 font-semibold">{overview.activeCampaigns}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-subtle"><MousePointerClick size={13} /> {t.overview.clicks}</div>
                <div className="mt-0.5 font-semibold">{num(overview.clicks, lang)}</div>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted">
              <ShieldCheck size={16} className="text-good" /> {t.overview.filtered}
            </div>
            <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">{num(c.filtered, lang)}</div>
            <Link href="/app/conversions?status=not_billed" className="mt-3 inline-block text-xs font-medium text-violet-400 hover:text-violet-300">
              {t.conversions.title} →
            </Link>
          </Card>
        </div>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-4 font-semibold">{t.overview.countries}</h2>
        {countries.length === 0 ? (
          <Empty>{t.overview.empty}</Empty>
        ) : (
          <ul className="grid gap-3">
            {countries.slice(0, 8).map((row) => (
              <li key={row.country} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-4 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <span aria-hidden="true">{flag(row.country)}</span>
                  {countryName(row.country, lang)}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-strong">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-orange-400"
                    style={{ width: `${Math.max(4, Number((row.spend * 1000n) / maxCountrySpend) / 10)}%` }}
                  />
                </span>
                <span className="text-right font-mono tabular-nums">
                  {usd(row.spend, lang)} <span className="text-subtle">· {num(row.installs, lang)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

import { MousePointerClick, Trophy, Wallet } from 'lucide-react';
import { publisherOverview } from '@kiqro/network/publisher';
import { Card, PageHeader, Segmented } from '@/components/panel/ui';
import { TrendChart } from '@/components/panel/TrendChart';
import { db } from '@/lib/db';
import { num, shortDate, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';

export const dynamic = 'force-dynamic';

const PERIODS = [7, 30, 90] as const;

export default async function PublisherOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const [{ org }, lang, sp] = await Promise.all([requirePublisherOrg(), panelLocale(), searchParams]);
  const t = PANEL[lang].pub;
  const periods = PANEL[lang].periods;
  const days = PERIODS.find((p) => String(p) === sp.days) ?? 30;
  const o = await publisherOverview(db, org.id, days);
  const epc = o.clicks ? o.earnings / BigInt(o.clicks) : 0n;

  const kpis = [
    { label: t.earned, value: usd(o.earnings, lang), icon: Wallet },
    { label: t.rewards, value: num(o.conversions, lang), icon: Trophy },
    { label: t.clicks, value: num(o.clicks, lang), icon: MousePointerClick },
    { label: t.epc, value: o.clicks ? usd(epc, lang) : '—', icon: Wallet },
  ];

  return (
    <>
      <PageHeader title={t.overviewTitle} sub={t.overviewSub}>
        <Segmented value={String(days)} options={PERIODS.map((d) => ({ value: String(d), label: periods[d]!, href: `/app/publisher?days=${d}` }))} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm text-muted">
              <k.icon size={15} className="text-violet-400" /> {k.label}
            </div>
            <div className="mt-2 font-mono text-xl font-semibold tracking-tight tabular-nums sm:text-[1.65rem]">{k.value}</div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold">{t.daily}</h2>
          <TrendChart
            locale={lang === 'tr' ? 'tr-TR' : 'en-US'}
            labels={{ spend: t.earned, installs: t.rewards, events: t.clicks }}
            points={o.series.map((d) => ({ label: shortDate(d.date, lang), spend: Number(d.earnings) / 1e6, installs: d.conversions, events: d.clicks }))}
          />
        </Card>
        <Card className="relative overflow-hidden p-5">
          <div className="absolute -top-28 -right-28 h-64 w-64 bg-[radial-gradient(closest-side,rgb(139_92_246/0.24),transparent)]" />
          <div className="relative text-sm text-muted">{t.payable}</div>
          <div className="relative mt-2 font-mono text-3xl font-semibold tabular-nums">{usd(o.payable, lang)}</div>
          <p className="relative mt-3 text-xs text-subtle">{t.payableHint}</p>
        </Card>
      </div>
    </>
  );
}

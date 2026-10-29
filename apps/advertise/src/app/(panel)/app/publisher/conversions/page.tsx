import { publisherConversions } from '@kiqro/network/publisher';
import { Card, Empty, PageHeader, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { dateTime, num, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';

export const dynamic = 'force-dynamic';

const PILL: Record<string, string> = { approved: 'active', held: 'in_review', reversed: 'refunded' };

export default async function PublisherConversionsPage() {
  const [{ org }, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const t = PANEL[lang].pub;
  const rows = await publisherConversions(db, org.id);
  const pick = (m: Record<string, string>) => m[lang] ?? m.en ?? Object.values(m)[0] ?? '';

  return (
    <>
      <PageHeader title={t.conversionsTitle} sub={t.conversionsSub} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty>{t.empty}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">{PANEL[lang].billing.cols.date}</th>
                  <th className="px-5 py-3 font-medium">{t.user}</th>
                  <th className="px-5 py-3 font-medium">{t.offer}</th>
                  <th className="px-5 py-3 text-right font-medium">{t.points}</th>
                  <th className="px-5 py-3 text-right font-medium">{t.earning}</th>
                  <th className="px-5 py-3 font-medium">{PANEL[lang].billing.cols.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap">{dateTime(r.createdAt, lang)}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.publisherUserId}</td>
                    <td className="px-5 py-3">
                      {pick(r.offer)}
                      <div className="text-xs text-subtle">
                        {pick(r.task)} · {r.placement}
                        {r.country ? ` · ${r.country}` : ''}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{num(Number(r.points), lang)}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{usd(r.payout, lang)}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={PILL[r.status] ?? r.status} label={t.statuses[r.status] ?? r.status} />
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

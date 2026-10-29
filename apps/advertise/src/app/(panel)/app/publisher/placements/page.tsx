import { publisherPlacements } from '@kiqro/network/publisher';
import { Card, Empty, PageHeader, StatusPill } from '@/components/panel/ui';
import { CopyField } from '@/components/panel/CopyField';
import { db } from '@/lib/db';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';
import { PlacementForm } from './PlacementForm';

export const dynamic = 'force-dynamic';

export default async function PlacementsPage() {
  const [{ org, user }, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const t = PANEL[lang].pub;
  const c = PANEL[lang].integration;
  const copy = { copy: c.copy, copied: c.copied };
  const placements = await publisherPlacements(db, org.id);
  const track = process.env.TRACKING_BASE_URL ?? 'https://track.kiqro.com';

  return (
    <>
      <PageHeader title={t.placementsTitle} sub={t.placementsSub} />
      {placements.length === 0 ? (
        <Card>
          <Empty>{t.empty}</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {placements.map((p) => (
            <Card key={p.id} className="p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted" title={t.shareHint}>
                    {t.share}: <b className="text-fg">%{(p.revshareBps / 100).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</b>
                  </span>
                  <StatusPill status={p.status === 'active' ? 'active' : 'paused'} label={t.status[p.status] ?? p.status} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="grid min-w-0 grid-cols-1 content-start gap-4">
                  <div>
                    <div className="mb-1 text-xs text-subtle">{t.appKey}</div>
                    <CopyField value={p.appKey} copyLabel={copy.copy} copiedLabel={copy.copied} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-subtle">{t.wall}</div>
                    <CopyField value={`${track}/wall?app_key=${p.appKey}&user_id={user_id}&sig={sig}&lang=en`} copyLabel={copy.copy} copiedLabel={copy.copied} />
                    <p className="mt-1 text-xs text-subtle">{t.wallHint}</p>
                  </div>
                </div>
                <PlacementForm p={{ id: p.id, currencyName: p.currencyName, pointsPerUsd: p.pointsPerUsd, postbackUrl: p.postbackUrl, secret: p.secret }} t={t} canEdit={user.role === 'admin'} copy={copy} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

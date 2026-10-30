import QRCode from 'qrcode';
import { sign } from '@kiqro/core';
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
  const track = process.env.TRACKING_BASE_URL ?? 'https://track.kiqronetwork.com';

  // A signed wall link for the signed-in member's own test user, so the full flow can be tried on
  // a phone without building the signature by hand. Rewards for it go through the normal postback.
  const testUser = `test-${user.id}`;
  const tests = await Promise.all(
    placements.map(async (p) => {
      const q = new URLSearchParams({ app_key: p.appKey, user_id: testUser, sig: sign(p.secret, [p.appKey, testUser]), lang });
      const url = `${track}/wall?${q}`;
      return { url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 148 }) };
    }),
  );

  return (
    <>
      <PageHeader title={t.placementsTitle} sub={t.placementsSub} />
      {placements.length === 0 ? (
        <Card>
          <Empty>{t.empty}</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {placements.map((p, i) => (
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
                  <div className="rounded-xl border border-line p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{t.testWall}</div>
                      <a href={tests[i]!.url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
                        {t.testWallOpen} ↗
                      </a>
                    </div>
                    <p className="mb-3 text-xs leading-relaxed break-words text-subtle">{t.testWallHint.replace('{user}', testUser)}</p>
                    {/* QR code SVG generated on the server from the signed test link. */}
                    <div className="h-[160px] w-[160px] rounded-lg bg-white p-1.5" dangerouslySetInnerHTML={{ __html: tests[i]!.svg }} />
                    <div className="mt-3">
                      <CopyField value={tests[i]!.url} copyLabel={copy.copy} copiedLabel={copy.copied} />
                    </div>
                  </div>
                </div>
                <PlacementForm p={{ id: p.id, currencyName: p.currencyName, pointsPerUsd: p.pointsPerUsd, postbackUrl: p.postbackUrl, secret: p.secret, brandColor: p.brandColor, logoUrl: p.logoUrl, wallTitle: p.wallTitle }} t={t} canEdit={user.role === 'admin'} copy={copy} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

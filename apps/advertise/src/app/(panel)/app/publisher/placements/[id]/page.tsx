import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import { sign } from '@kiqro/core';
import { placementStats, publisherPlacement } from '@kiqro/network/publisher';
import { Card, StatusPill } from '@/components/panel/ui';
import { CopyField } from '@/components/panel/CopyField';
import { db } from '@/lib/db';
import { num, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';
import { PlacementForm } from '../PlacementForm';
import { PlacementIcon, TypeBadge } from '../shared';
import { DeleteButton, ProfileRows, Row, SecretField, StatusButton } from './client';

export const dynamic = 'force-dynamic';

function Section({ title, sub, children, className = '' }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 className="font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </Card>
  );
}

export default async function PlacementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ org, user }, lang, { id }, sp] = await Promise.all([requirePublisherOrg(), panelLocale(), params, searchParams]);
  const placement = await publisherPlacement(db, org.id, id);
  if (!placement) notFound();
  const t = PANEL[lang].pub;
  const p = t.pl;
  const c = PANEL[lang].integration;
  const copy = { copy: c.copy, copied: c.copied };
  const canEdit = user.role === 'admin';
  const s = (await placementStats(db, [placement.id], 7)).get(placement.id)!;
  const track = process.env.TRACKING_BASE_URL ?? 'https://track.kiqronetwork.com';

  // Signed wall link for the signed-in member's own test user (see the Testing section).
  const testUser = `test-${user.id}`;
  const testUrl = `${track}/wall?${new URLSearchParams({ app_key: placement.appKey, user_id: testUser, sig: sign(placement.secret, [placement.appKey, testUser]), lang })}`;
  const qr = await QRCode.toString(testUrl, { type: 'svg', margin: 1, width: 148 });
  const created = placement.createdAt.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <Link href="/app/publisher/placements" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={15} /> {p.back}
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <PlacementIcon type={placement.type} iconUrl={placement.iconUrl} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{placement.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <TypeBadge type={placement.type} label={p.typeLong[placement.type] ?? placement.type} />
            <StatusPill status={placement.status === 'active' ? 'active' : 'paused'} label={t.status[placement.status] ?? placement.status} />
          </div>
        </div>
        {canEdit && <StatusButton id={placement.id} status={placement.status} p={p} />}
      </div>

      {sp.created && <p className="rounded-xl border border-good/30 bg-good/10 px-4 py-2.5 text-sm text-good">{p.created}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [p.cols.users, num(s.users, lang)],
          [p.cols.clicks, num(s.clicks, lang)],
          [p.cols.rewards, num(s.conversions, lang)],
          [p.cols.earnings, usd(s.earnings, lang)],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <div className="text-xs text-subtle">
              {k} · {p.last7}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </Card>
        ))}
      </div>

      <Section title={p.general} sub={p.generalSub}>
        <Row label={p.type}>{p.typeLong[placement.type] ?? placement.type}</Row>
        <Row label={p.statusLabel}>
          <StatusPill status={placement.status === 'active' ? 'active' : 'paused'} label={t.status[placement.status] ?? placement.status} />
        </Row>
        <ProfileRows id={placement.id} name={placement.name} storeUrl={placement.storeUrl} needsStore={placement.type === 'web'} canEdit={canEdit} p={p} />
        <Row label={t.share}>
          <span title={t.shareHint}>%{(placement.revshareBps / 100).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</span>
        </Row>
        <Row label={p.createdAt}>{created}</Row>
      </Section>

      <Section title={p.keys} sub={p.keysSub}>
        <Row label={t.appKey}>
          <CopyField value={placement.appKey} copyLabel={copy.copy} copiedLabel={copy.copied} />
        </Row>
        <Row label={t.secret}>
          <SecretField secret={placement.secret} copy={copy} reveal={t.reveal} />
        </Row>
        <Row label={t.wall}>
          <CopyField value={`${track}/wall?app_key=${placement.appKey}&user_id={user_id}&sig={sig}&lang=${lang}`} copyLabel={copy.copy} copiedLabel={copy.copied} />
          <p className="mt-1 text-xs text-subtle">{t.wallHint}</p>
        </Row>
        <div className="px-5 py-3.5 sm:px-6">
          <Link href="/app/publisher/integration" className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300">
            <BookOpen size={14} /> {p.docs}
          </Link>
        </div>
      </Section>

      <Section title={p.settingsTitle} sub={p.settingsSub}>
        <div className="p-5 sm:p-6">
          <PlacementForm
            p={{ id: placement.id, currencyName: placement.currencyName, pointsPerUsd: placement.pointsPerUsd, postbackUrl: placement.postbackUrl, brandColor: placement.brandColor, logoUrl: placement.logoUrl, wallTitle: placement.wallTitle }}
            t={t}
            canEdit={canEdit}
          />
        </div>
      </Section>

      <Section title={p.testTitle} sub={p.testSub}>
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
          {/* QR code SVG generated on the server from the signed test link. */}
          <div className="h-[160px] w-[160px] rounded-lg bg-white p-1.5" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="grid min-w-0 content-start gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t.testWall}</h3>
              <a href={testUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-3 !py-1.5 text-xs">
                {t.testWallOpen} <ExternalLink size={12} />
              </a>
            </div>
            <p className="text-xs leading-relaxed break-words text-subtle">{t.testWallHint.replace('{user}', testUser)}</p>
            <CopyField value={testUrl} copyLabel={copy.copy} copiedLabel={copy.copied} />
          </div>
        </div>
      </Section>

      {canEdit && (
        <Section title={p.danger} sub={p.dangerSub} className="border-bad/25">
          <div className="p-5 sm:p-6">
            <DeleteButton id={placement.id} p={p} />
          </div>
        </Section>
      )}
    </div>
  );
}

import Link from 'next/link';
import { and, desc, eq, ne } from 'drizzle-orm';
import { FlaskConical, KeyRound, Link2, RefreshCw, RotateCcw, Timer } from 'lucide-react';
import { schema } from '@kiqro/db';
import { listTestClicks } from '@kiqro/network';
import { CopyField } from '@/components/panel/CopyField';
import { Card, PageHeader, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';
import { TestClickForm } from './TestClickForm';

// Pill colours for test events, from the panel's status palette.
const EVENT_PILL: Record<string, string> = { approved: 'active', held: 'in_review', rejected: 'refunded', reversed: 'draft' };

export const dynamic = 'force-dynamic';

export default async function IntegrationPage() {
  const [{ org }, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const t = PANEL[lang].integration;
  const base = process.env.TRACKING_BASE_URL ?? 'https://track.kiqronetwork.com';
  const events = `${base}/v1/mmp/${org.postbackKey}?click_id={clickid}&event={event_name}&event_ts={timestamp}`;
  const reversal = `${base}/v1/mmp/${org.postbackKey}/reversal?click_id={clickid}&event={event_name}&reason={reason}`;
  const [campaigns, testClicks] = await Promise.all([
    db
      .select({ id: schema.campaigns.id, name: schema.campaigns.name })
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.orgId, org.id), ne(schema.campaigns.status, 'archived')))
      .orderBy(desc(schema.campaigns.createdAt)),
    listTestClicks(db, { orgId: org.id }, 8),
  ]);
  const tt = t.test;

  return (
    <>
      <PageHeader title={t.title} sub={t.sub} />
      <div className="grid grid-cols-1 gap-4">
        <Card className="p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Link2 size={17} className="text-violet-400" /> {t.events}
          </h2>
          <CopyField value={events} copyLabel={t.copy} copiedLabel={t.copied} />
        </Card>
        <Card className="p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <RotateCcw size={17} className="text-violet-400" /> {t.reversal}
          </h2>
          <CopyField value={reversal} copyLabel={t.copy} copiedLabel={t.copied} />
        </Card>
        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <FlaskConical size={17} className="text-violet-400" /> {tt.title}
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-muted">{tt.sub}</p>
          {campaigns.length ? <TestClickForm t={tt} copy={{ copy: t.copy, copied: t.copied }} campaigns={campaigns} /> : <p className="text-sm text-muted">{tt.noCampaigns}</p>}
          {testClicks.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">{tt.recent}</h3>
                <Link href="/app/integration" className="flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300">
                  <RefreshCw size={13} /> {tt.refresh}
                </Link>
              </div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {testClicks.map((c) => (
                  <li key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="min-w-0">
                      <code className="font-mono text-xs break-all">{c.id}</code>
                      <div className="mt-0.5 text-xs text-subtle">
                        {c.campaignName} · {dateTime(c.createdAt, lang)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      {c.events.length === 0 ? (
                        <span className="text-xs text-subtle">{tt.noEvents}</span>
                      ) : (
                        c.events.map((e, i) => (
                          <span key={i} className="flex items-center gap-1.5 text-xs">
                            <code className="font-mono">{e.event}</code>
                            <StatusPill status={EVENT_PILL[e.status] ?? e.status} label={tt.status[e.status] ?? e.status} />
                            {e.reasons.length > 0 && <span className="text-subtle">({e.reasons.join(', ')})</span>}
                          </span>
                        ))
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <Timer size={17} className="text-violet-400" /> {t.window}
            </h2>
            <p className="font-mono text-2xl font-semibold">
              {org.reversalWindowDays} <span className="text-base font-normal text-muted">{t.days}</span>
            </p>
            <p className="mt-3 text-sm text-muted">{t.macros}</p>
          </Card>
          {org.postbackSecret && (
            <Card className="p-6">
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <KeyRound size={17} className="text-violet-400" /> {t.signature}
              </h2>
              <p className="text-sm leading-relaxed text-muted">{t.signatureBody}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

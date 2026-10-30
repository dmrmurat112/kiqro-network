import { KeyRound, Link2, RotateCcw, Timer } from 'lucide-react';
import { CopyField } from '@/components/panel/CopyField';
import { Card, PageHeader } from '@/components/panel/ui';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function IntegrationPage() {
  const [{ org }, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const t = PANEL[lang].integration;
  const base = process.env.TRACKING_BASE_URL ?? 'https://track.kiqronetwork.com';
  const events = `${base}/v1/mmp/${org.postbackKey}?click_id={clickid}&event={event_name}&event_ts={timestamp}`;
  const reversal = `${base}/v1/mmp/${org.postbackKey}/reversal?click_id={clickid}&event={event_name}&reason={reason}`;

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

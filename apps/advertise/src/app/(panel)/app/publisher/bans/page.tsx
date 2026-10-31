import { listUserBans } from '@kiqro/network/publisher';
import { Card, Empty, PageHeader } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';
import { BanForm, UnbanButton } from './BanForm';

export const dynamic = 'force-dynamic';

export default async function BansPage() {
  const [{ org, user }, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const t = PANEL[lang].pub;
  const bans = await listUserBans(db, org.id);
  const canEdit = user.role === 'admin';
  const date = (d: Date) => d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      <PageHeader title={t.bansTitle} sub={t.bansSub} />
      <div className="grid gap-4">
        {canEdit && (
          <Card className="p-5 sm:p-6">
            <BanForm t={t} />
          </Card>
        )}
        <Card className="overflow-hidden">
          {bans.length === 0 ? (
            <Empty>{t.bansEmpty}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {bans.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">{b.publisherUserId}</div>
                    <div className="mt-0.5 truncate text-xs text-subtle">
                      {t.bannedAt}: {date(b.createdAt)}
                      {b.reason ? ` · ${b.reason}` : ''}
                    </div>
                  </div>
                  {canEdit && <UnbanButton userId={b.publisherUserId} label={t.banRemove} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

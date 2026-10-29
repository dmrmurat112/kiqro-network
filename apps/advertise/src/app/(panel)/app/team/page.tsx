import { listTeam } from '@kiqro/network/advertiser';
import { Card, PageHeader } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiser } from '@/lib/session';
import { InviteForm, MemberRow } from './TeamClient';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const [{ org, user }, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const t = PANEL[lang].team;
  const members = await listTeam(db, org.id);
  const canManage = user.role === 'admin';

  return (
    <>
      <PageHeader title={t.title} sub={t.sub} />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-visible lg:col-span-3">
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <MemberRow key={m.id} t={t} me={m.id === user.id} canManage={canManage} m={{ ...m, lastLogin: m.lastLoginAt ? dateTime(m.lastLoginAt, lang) : null }} />
            ))}
          </ul>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">{t.invite}</h2>
          {canManage ? <InviteForm t={t} lang={lang} /> : <p className="text-sm text-muted">{t.adminOnly}</p>}
        </Card>
      </div>
    </>
  );
}

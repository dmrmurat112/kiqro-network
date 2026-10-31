import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/panel/ui';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';
import { NewPlacementForm } from './NewPlacementForm';

export const dynamic = 'force-dynamic';

export default async function NewPlacementPage() {
  const [{ user }, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  if (user.role !== 'admin') redirect('/app/publisher/placements');
  const t = PANEL[lang].pub;
  return (
    <>
      <PageHeader title={t.pl.newTitle} sub={t.pl.newSub} />
      <NewPlacementForm t={t} />
    </>
  );
}

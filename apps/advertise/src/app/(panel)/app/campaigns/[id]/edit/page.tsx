import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { advertiserCampaignForm, advertiserProducts } from '@kiqro/network/advertiser';
import { CampaignWizard } from '@/components/panel/CampaignWizard';
import { PageHeader } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, lang, { id }] = await Promise.all([requireAdvertiserOrg(), panelLocale(), params]);
  const data = await advertiserCampaignForm(db, session, id);
  if (!data) notFound();
  // Only drafts are editable; anything else goes back to the list.
  if (data.campaign.status !== 'draft') redirect('/app/campaigns');
  const t = PANEL[lang];
  const products = await advertiserProducts(db, session);

  return (
    <>
      <Link href="/app/campaigns" className="text-sm text-muted hover:text-fg">
        ← {t.campaigns.title}
      </Link>
      <div className="mt-3">
        <PageHeader title={t.wizard.editTitle} sub={data.campaign.name} />
      </div>
      <CampaignWizard
        t={t.wizard}
        lang={lang}
        campaignId={id}
        initial={data.form}
        reviewNote={data.campaign.reviewNote}
        returnedTitle={t.campaigns.returnedTitle}
        products={products.map((p) => ({ id: p.id, name: p.name, platform: p.platform, storeId: p.storeId, mmp: p.mmp, iconUrl: p.iconUrl, coverUrl: p.coverUrl, screenshots: p.screenshots }))}
      />
    </>
  );
}

import Link from 'next/link';
import { advertiserProducts } from '@kiqro/network/advertiser';
import { CampaignWizard } from '@/components/panel/CampaignWizard';
import { PageHeader } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const t = PANEL[lang];
  const products = await advertiserProducts(db, session);
  return (
    <>
      <Link href="/app/campaigns" className="text-sm text-muted hover:text-fg">
        ← {t.campaigns.title}
      </Link>
      <div className="mt-3">
        <PageHeader title={t.wizard.newTitle} />
      </div>
      <CampaignWizard
        t={t.wizard}
        lang={lang}
        returnedTitle={t.campaigns.returnedTitle}
        products={products.map((p) => ({ id: p.id, name: p.name, platform: p.platform, storeId: p.storeId, mmp: p.mmp, iconUrl: p.iconUrl }))}
      />
    </>
  );
}

import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { schema } from '@kiqro/db';
import { db } from '@/lib/db';
import { createCampaignAction } from '../actions';
import { CampaignForm } from '../CampaignForm';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const { productId } = await searchParams;
  const product = productId ? await db.query.products.findFirst({ where: eq(schema.products.id, productId) }) : undefined;
  if (!product) notFound();

  return (
    <>
      <h1>Yeni kampanya — {product.name}</h1>
      <p className="muted">Kampanya taslak olarak kaydedilir; yayına almak için kampanya sayfasından "Aktif et" denir.</p>
      <CampaignForm
        action={createCampaignAction}
        submitLabel="Taslak olarak kaydet"
        initial={{
          productId: product.id,
          name: '',
          trackingUrl: '',
          countries: [],
          totalBudgetUsd: '',
          dailyBudgetUsd: '',
          startAt: '',
          endAt: '',
          attributionWindowDays: 7,
          ctitMinSeconds: 10,
          titleEn: product.name,
          titleTr: product.name,
          descriptionEn: '',
          descriptionTr: '',
          tasks: [],
        }}
      />
    </>
  );
}

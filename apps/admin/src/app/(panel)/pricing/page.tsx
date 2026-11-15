import { DEFAULT_PRICING_GUIDE, loadPricingGuide, PRICING_EVENTS, type PricingEvent } from '@kiqro/network';
import { ActionForm } from '@/components/ActionForm';
import { db } from '@/lib/db';
import { savePricingGuideAction } from './actions';

export const dynamic = 'force-dynamic';

/** Quick-add buttons of the advertiser's campaign wizard, in the order they appear there. */
const LABELS: Record<PricingEvent, string> = {
  install: 'Kurulum',
  registration: 'Kayıt',
  level: 'Seviyeye ulaşma',
  deposit: 'İlk yatırım',
  kyc: 'KYC (kimlik doğrulama)',
  purchase: 'Satın alma',
  subscription: 'Abonelik',
  trial: 'Ücretsiz deneme aboneliği',
};

export default async function PricingPage() {
  const guide = await loadPricingGuide(db);
  return (
    <>
      <h1>Tavsiye edilen fiyatlar</h1>
      <p className="muted">
        Reklamveren yeni kampanya ekranında &quot;Hızlı ekle&quot;den bir olay seçtiğinde fiyat alanı bu tutarla dolar. Reklamveren daha düşük bir fiyat da girebilir; bu tutarlar
        yalnızca öneridir. Tüm tutarlar USD, &quot;Tüm ülkeler&quot; varsayılan fiyatı içindir.
      </p>
      <ActionForm action={savePricingGuideAction} submitLabel="Kaydet">
        <div className="card">
          <h2>Olay başına tavsiye edilen minimum fiyat</h2>
          <div className="fields">
            {PRICING_EVENTS.map((event) => (
              <label key={event}>
                {LABELS[event]}
                <input name={`price:${event}`} defaultValue={guide.prices[event]} inputMode="decimal" placeholder={DEFAULT_PRICING_GUIDE.prices[event]} required />
              </label>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Fiyat alanındaki bilgi kutusu</h2>
          <p className="muted">Fiyat alanının yanındaki (?) simgesinin üzerine gelindiğinde görünür. Boş bırakırsanız varsayılan metin kullanılır.</p>
          <div className="grid cols-2">
            <label>
              Türkçe
              <textarea name="help_tr" rows={5} defaultValue={guide.help.tr} placeholder={DEFAULT_PRICING_GUIDE.help.tr} />
            </label>
            <label>
              English
              <textarea name="help_en" rows={5} defaultValue={guide.help.en} placeholder={DEFAULT_PRICING_GUIDE.help.en} />
            </label>
          </div>
        </div>
      </ActionForm>
    </>
  );
}

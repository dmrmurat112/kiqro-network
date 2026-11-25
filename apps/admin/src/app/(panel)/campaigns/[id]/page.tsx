import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listTestClicks } from '@kiqro/network';
import { getCampaignForm } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { approveCampaignAction, createTestClickAction, duplicateCampaignAction, returnCampaignAction, setStatusAction, updateCampaignAction } from '../actions';
import { CampaignForm } from '../CampaignForm';

export const dynamic = 'force-dynamic';

const ACTIONS: Record<string, { to: string; label: string; danger?: boolean }[]> = {
  draft: [{ to: 'active', label: 'Aktif et' }, { to: 'archived', label: 'Arşivle', danger: true }],
  // Self-serve submissions are approved or returned with a note (review card below).
  in_review: [],
  active: [{ to: 'paused', label: 'Duraklat' }, { to: 'completed', label: 'Bitir', danger: true }],
  paused: [{ to: 'active', label: 'Devam ettir' }, { to: 'completed', label: 'Bitir', danger: true }],
  completed: [{ to: 'archived', label: 'Arşivle' }],
  archived: [],
};

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCampaignForm(db, id);
  if (!data) notFound();
  const { campaign, form, hasClicks, spend } = data;
  const [product, advertiser, testClicks] = await Promise.all([
    db.query.products.findFirst({ where: (p, { eq }) => eq(p.id, campaign.productId), columns: { iconUrl: true, coverUrl: true } }),
    db.query.organizations.findFirst({ where: (o, { eq }) => eq(o.id, campaign.orgId), columns: { postbackKey: true, postbackSecret: true } }),
    listTestClicks(db, { campaignId: id }),
  ]);
  const trackingBase = process.env.TRACKING_BASE_URL ?? 'https://track.kiqronetwork.com';

  return (
    <>
      <div className="row spread">
        <h1>{campaign.name}</h1>
        <div className="row">
          <Badge status={campaign.status} />
          {ACTIONS[campaign.status]!.map((a) => (
            <ActionForm key={a.to} action={setStatusAction.bind(null, id)} submitLabel={a.label} className="row" buttonClass={a.danger ? 'danger small' : 'small'} confirm={`Kampanya durumu "${a.label}" olarak değişecek. Emin misiniz?`}>
              <input type="hidden" name="status" value={a.to} />
            </ActionForm>
          ))}
          <ActionForm action={duplicateCampaignAction.bind(null, id)} submitLabel="Kopyala" className="row" buttonClass="secondary small" />
        </div>
      </div>
      {campaign.status === 'in_review' && (
        <div className="card" style={{ borderColor: '#e0b46a', background: '#fffaf0' }}>
          <h2>Reklamveren incelemeye gönderdi</h2>
          <p className="muted">
            Gönderim: {dateTime(campaign.submittedAt)}. Takip linkini (test tıklaması + test postback), MMP olay adlarını, süreleri, fiyatları ve reklam politikasını kontrol edin.
          </p>
          {product && (product.iconUrl || product.coverUrl) && (
            <div className="row" style={{ alignItems: 'flex-start', margin: '8px 0 12px' }}>
              {/* Offerwall images of the app: the cover is any https link the advertiser chose, so check it here. */}
              {product.iconUrl && <img src={product.iconUrl} alt="" width={56} height={56} style={{ borderRadius: 12, objectFit: 'cover' }} referrerPolicy="no-referrer" />}
              {product.coverUrl && (
                <a href={product.coverUrl} target="_blank" rel="noopener noreferrer" title="Kapak görseli (offerwall)">
                  <img src={product.coverUrl} alt="Kapak görseli" style={{ width: 240, aspectRatio: '2 / 1', borderRadius: 12, objectFit: 'cover', display: 'block' }} referrerPolicy="no-referrer" />
                </a>
              )}
            </div>
          )}
          <div className="grid cols-2">
            <ActionForm action={approveCampaignAction.bind(null, id)} submitLabel="Onayla ve yayına al" confirm="Kampanya hemen yayına girecek. Emin misiniz?">
              <p className="muted">Reklamverene "kampanyanız yayında" e-postası gider.</p>
            </ActionForm>
            <ActionForm action={returnCampaignAction.bind(null, id)} submitLabel="Notla geri gönder" buttonClass="secondary">
              <label>
                Reklamverene not (ne değişmeli?)
                <textarea name="note" rows={3} required />
              </label>
            </ActionForm>
          </div>
        </div>
      )}
      {campaign.status === 'draft' && campaign.reviewNote && (
        <p className="notice info">Son geri gönderme notu: {campaign.reviewNote}</p>
      )}
      <div className="grid cols-4">
        <div className="card stat">
          <div className="value">{usd(spend)}</div>
          <div className="label">Harcama</div>
        </div>
        <div className="card stat">
          <div className="value">{usd(campaign.totalBudget)}</div>
          <div className="label">Toplam bütçe</div>
        </div>
        <div className="card stat">
          <div className="value">{campaign.countries.join(', ')}</div>
          <div className="label">Ülkeler</div>
        </div>
        <div className="card stat">
          <div className="value">
            <Link href={`/conversions?campaignId=${id}`}>Dönüşümler →</Link>
          </div>
          <div className="label">Bu kampanyanın dönüşüm kayıtları</div>
        </div>
      </div>
      <div className="card">
        <div className="row spread">
          <h2>Test tıklaması</h2>
          <ActionForm action={createTestClickAction.bind(null, id)} submitLabel="Test tıklaması oluştur" className="row" buttonClass="secondary small" />
        </div>
        <p className="muted">
          Reklamverenin postback'lerini gerçek kullanıcı olmadan denemek için bir click_id üretir. Kampanya duraklatılmış olsa da çalışır. Test tıklamalarından gelen olaylar
          onaylanır ama ücretlendirilmez, yayıncıya iletilmez. Kurulum (install) postback'i tıklamadan en az {campaign.ctitMinSeconds} saniye sonra gönderilmeli.
        </p>
        {advertiser?.postbackKey && (
          <p>
            Örnek istek:
            <br />
            <code>{`${trackingBase}/v1/mmp/${advertiser.postbackKey}?click_id=<CLICK_ID>&event=install${advertiser.postbackSecret ? '&sig=<HMAC>' : ''}`}</code>
          </p>
        )}
        {testClicks.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>click_id</th>
                <th>Oluşturuldu</th>
                <th>Gelen olaylar</th>
              </tr>
            </thead>
            <tbody>
              {testClicks.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.id}</code>
                  </td>
                  <td>{dateTime(c.createdAt)}</td>
                  <td>
                    {c.events.length === 0
                      ? <span className="muted">Henüz yok</span>
                      : c.events.map((e, i) => (
                          <div key={i}>
                            <code>{e.event}</code> · {e.status}
                            {e.reasons.length > 0 && <span className="muted"> ({e.reasons.join(', ')})</span>}
                          </div>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <CampaignForm action={updateCampaignAction.bind(null, id)} submitLabel="Değişiklikleri kaydet" initial={form} tasksLocked={hasClicks} />
    </>
  );
}

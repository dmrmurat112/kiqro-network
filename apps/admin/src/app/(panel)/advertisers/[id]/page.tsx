import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrganization, listCampaigns, listProducts } from '@kiqro/network/admin';
import { listAdvertiserUsers } from '@kiqro/network/advertiser';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { createAdvertiserUserAction, createProductAction, resendInviteAction, topUpAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdvertiserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getOrganization(db, id);
  if (!org || org.type !== 'advertiser') notFound();
  const [products, campaigns, users] = await Promise.all([listProducts(db, id), listCampaigns(db, { orgId: id }), listAdvertiserUsers(db, id)]);
  const trackingBase = process.env.TRACKING_BASE_URL ?? 'https://track.kiqro.com';

  return (
    <>
      <div className="row spread">
        <h1>{org.name}</h1>
        <Badge status={org.status} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Entegrasyon</h2>
          <p className="muted">Reklamverenin MMP'sine verilecek postback adresleri:</p>
          <p>
            Kurulum ve olaylar:
            <br />
            <code>{`${trackingBase}/v1/mmp/${org.postbackKey}?click_id={clickid}&event={event_name}&event_ts={timestamp}`}</code>
          </p>
          <p>
            Geri alma (reddedilen kurulum/olay):
            <br />
            <code>{`${trackingBase}/v1/mmp/${org.postbackKey}/reversal?click_id={clickid}&event={event_name}&reason={reason}`}</code>
          </p>
          {org.postbackSecret && (
            <p className="notice info">
              Postback'ler imzalı olmalı: <code>sig = HMAC-SHA256(gizli anahtar, click_id|event)</code>. Gizli anahtar:{' '}
              <code>{org.postbackSecret}</code>
            </p>
          )}
          <p className="muted">Geri alma süresi: {org.reversalWindowDays} gün · Fatura: {org.billingEntity === 'kiqro_inc' ? 'Kiqro Inc.' : 'Kiqro Oy'} / {org.invoiceCurrency}</p>
        </div>

        <div className="card">
          <h2>Bakiye: {usd(org.balance)}</h2>
          <ActionForm action={topUpAction.bind(null, id)} submitLabel="Bakiye yükle" resetOnSuccess confirm="Bu ödeme gerçekten alındı mı? Bakiye kaydı geri alınamaz.">
            <div className="fields">
              <label>
                Tutar (USD)
                <input name="amountUsd" placeholder="500.00" required />
              </label>
              <label>
                Referans
                <input name="memo" placeholder="Stripe pi_… / havale ref." required />
              </label>
            </div>
          </ActionForm>
          <p className="muted">Yalnızca tahsil edilmiş ödemeleri kaydedin. Kayıt denetim günlüğüne yazılır.</p>
        </div>
      </div>

      <div className="card">
        <h2>Reklamveren paneli kullanıcıları</h2>
        {users.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Ad</th>
                <th>E-posta</th>
                <th>Son giriş</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Henüz giriş yapmadı'}</td>
                  <td>
                    <ActionForm action={resendInviteAction.bind(null, id, u.id)} submitLabel="Daveti yeniden gönder" className="row" buttonClass="secondary small" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ActionForm action={createAdvertiserUserAction.bind(null, id)} submitLabel="Kullanıcı oluştur" resetOnSuccess>
          <div className="fields">
            <label>
              Ad soyad
              <input name="name" required />
            </label>
            <label>
              E-posta
              <input name="email" type="email" required />
            </label>
            <label>
              Panel dili
              <select name="locale" defaultValue="en">
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </select>
            </label>
          </div>
        </ActionForm>
        <p className="muted">Reklamveren advertise.kiqro.com/login adresinden giriş yapar ve yalnızca kendi kampanya ve dönüşüm verilerini görür.</p>
      </div>

      <div className="card">
        <h2>Ürünler</h2>
        {products.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Platform</th>
                <th>Mağaza kimliği</th>
                <th>MMP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.platform}</td>
                  <td className="mono">{p.storeId}</td>
                  <td>{p.mmp}</td>
                  <td>
                    <Link href={`/campaigns/new?productId=${p.id}`}>Kampanya oluştur</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h2 style={{ marginTop: 16 }}>Yeni ürün</h2>
        <ActionForm action={createProductAction.bind(null, id)} submitLabel="Ürün ekle" resetOnSuccess>
          <div className="fields">
            <label>
              Ad
              <input name="name" required />
            </label>
            <label>
              Platform
              <select name="platform" defaultValue="android">
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="web">Web</option>
              </select>
            </label>
            <label>
              Paket adı / App Store ID / alan adı
              <input name="storeId" required />
            </label>
            <label>
              MMP
              <select name="mmp" defaultValue="appsflyer">
                <option value="appsflyer">AppsFlyer</option>
                <option value="adjust">Adjust</option>
                <option value="singular">Singular</option>
                <option value="kochava">Kochava</option>
                <option value="branch">Branch</option>
                <option value="tenjin">Tenjin</option>
                <option value="none">Yok (S2S)</option>
              </select>
            </label>
            <label>
              İkon URL (isteğe bağlı)
              <input name="iconUrl" type="url" />
            </label>
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>Kampanyalar</h2>
        {campaigns.length === 0 ? (
          <p className="muted">Kampanya yok. Önce bir ürün ekleyip "Kampanya oluştur"a tıklayın.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kampanya</th>
                <th>Ürün</th>
                <th>Durum</th>
                <th className="num">Harcama</th>
                <th className="num">Bütçe</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(({ campaign, productName, spend }) => (
                <tr key={campaign.id}>
                  <td>
                    <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
                  </td>
                  <td>{productName}</td>
                  <td>
                    <Badge status={campaign.status} />
                  </td>
                  <td className="num">{usd(spend)}</td>
                  <td className="num">{usd(campaign.totalBudget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

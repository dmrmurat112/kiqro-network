import { notFound } from 'next/navigation';
import { getOrganization, listPlacements } from '@kiqro/network/admin';
import { listAdvertiserUsers } from '@kiqro/network/advertiser';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { createPlacementAction, createPublisherUserAction, resendPublisherInviteAction, updatePlacementAction } from '../actions';

export const dynamic = 'force-dynamic';

type Defaults = { name: string; currencyName: string; pointsPerUsd: string; revsharePercent: string; postbackUrl: string; status: string };

function PlacementFields({ d }: { d: Defaults }) {
  return (
    <div className="fields">
      <label>
        Ad
        <input name="name" defaultValue={d.name} required />
      </label>
      <label>
        Sanal para adı
        <input name="currencyName" defaultValue={d.currencyName} required />
      </label>
      <label>
        1 USD yayıncı payı = kaç puan (yayıncı belirler)
        <input name="pointsPerUsd" defaultValue={d.pointsPerUsd} required />
      </label>
      <label>
        Yayıncı gelir payı % (Kiqro belirler)
        <input name="revsharePercent" defaultValue={d.revsharePercent} required />
      </label>
      <label>
        Durum
        <select name="status" defaultValue={d.status}>
          <option value="active">Aktif</option>
          <option value="paused">Duraklatıldı</option>
        </select>
      </label>
      <label style={{ gridColumn: '1 / -1' }}>
        Postback URL — {'{user_id} {amount} {payout_usd} {transaction_id} {offer_id} {offer_name} {task_name} {status} {country} {signature}'}
        <input name="postbackUrl" defaultValue={d.postbackUrl} placeholder="https://api.yayinci.com/kiqro?uid={user_id}&amount={amount}&tx={transaction_id}&status={status}&sig={signature}" />
      </label>
    </div>
  );
}

export default async function PublisherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getOrganization(db, id);
  if (!org || org.type !== 'publisher') notFound();
  const [placements, users] = await Promise.all([listPlacements(db, id), listAdvertiserUsers(db, id)]);
  const trackingBase = process.env.TRACKING_BASE_URL ?? 'https://track.kiqronetwork.com';

  return (
    <>
      <h1>{org.name}</h1>
      <p className="muted">Yayıncıya borç (kesinleşmiş ve geri alınmamış): {usd(org.balance)}</p>

      {placements.map((p) => (
        <div className="card" key={p.id}>
          <div className="row spread">
            <h2>{p.name}</h2>
            <Badge status={p.status} />
          </div>
          <p>
            Tür: <b>{{ android: 'Android uygulaması', ios: 'iOS uygulaması', web: 'Web sitesi', api: 'API / Ağ' }[p.type]}</b>
            {p.storeUrl && (
              <>
                {' · '}
                <a href={p.storeUrl} target="_blank" rel="noopener noreferrer">
                  {p.storeUrl}
                </a>
              </>
            )}
            <br />
            App key: <code>{p.appKey}</code>
            <br />
            Gizli anahtar: <code>{p.secret}</code>
          </p>
          <p className="muted">
            Offers API: <code>{`${trackingBase}/v1/offers?app_key=${p.appKey}&user_id={user_id}&country={country}&lang={lang}&sig={HMAC(secret, app_key|user_id)}`}</code>
            <br />
            Postback imzası: <code>HMAC-SHA256(secret, user_id|amount|transaction_id|status)</code>, status 1 = ödül, 2 = geri alma (chargeback).
          </p>
          <ActionForm action={updatePlacementAction.bind(null, id, p.id)} submitLabel="Kaydet">
            <PlacementFields
              d={{
                name: p.name,
                currencyName: p.currencyName,
                pointsPerUsd: p.pointsPerUsd.includes('.') ? p.pointsPerUsd.replace(/0+$/, '').replace(/\.$/, '') : p.pointsPerUsd,
                revsharePercent: String(p.revshareBps / 100),
                postbackUrl: p.postbackUrl ?? '',
                status: p.status,
              }}
            />
          </ActionForm>
        </div>
      ))}

      <div className="card">
        <h2>Yayıncı paneli kullanıcıları</h2>
        <p className="muted">Yayıncı kiqronetwork.com/login adresinden girer: kazançlarını, placement ayarlarını (para birimi, puan kuru, postback adresi) ve barındırılan offerwall linkini görür. Gelir payı yalnızca buradan değişir.</p>
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
                  <td>{!u.lastLoginAt && !u.disabledAt && <ActionForm action={resendPublisherInviteAction.bind(null, id, u.id)} submitLabel="Daveti yeniden gönder" className="row" buttonClass="secondary small" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ActionForm action={createPublisherUserAction.bind(null, id)} submitLabel="Kullanıcı oluştur" resetOnSuccess>
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
      </div>

      <div className="card">
        <h2>Yeni placement</h2>
        <ActionForm action={createPlacementAction.bind(null, id)} submitLabel="Oluştur" resetOnSuccess>
          <PlacementFields d={{ name: '', currencyName: 'Puan', pointsPerUsd: '1000', revsharePercent: '70', postbackUrl: '', status: 'active' }} />
        </ActionForm>
      </div>
    </>
  );
}

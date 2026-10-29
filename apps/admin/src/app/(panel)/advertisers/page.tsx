import Link from 'next/link';
import { listOrganizations } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { createAdvertiserAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdvertisersPage() {
  const advertisers = await listOrganizations(db, 'advertiser');
  return (
    <>
      <h1>Reklamverenler</h1>
      <div className="card">
        {advertisers.length === 0 ? (
          <p className="muted">Henüz reklamveren yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Ülke</th>
                <th>Faturalayan</th>
                <th>Durum</th>
                <th className="num">Bakiye</th>
                <th>Oluşturulma</th>
              </tr>
            </thead>
            <tbody>
              {advertisers.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/advertisers/${a.id}`}>{a.name}</Link>
                  </td>
                  <td>{a.country}</td>
                  <td>{a.billingEntity === 'kiqro_inc' ? 'Kiqro Inc.' : 'Kiqro Oy'}</td>
                  <td>
                    <Badge status={a.status} />
                  </td>
                  <td className="num">{usd(a.balance)}</td>
                  <td>{dateTime(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Yeni reklamveren</h2>
        <ActionForm action={createAdvertiserAction} submitLabel="Oluştur" resetOnSuccess>
          <div className="fields">
            <label>
              Şirket adı
              <input name="name" required />
            </label>
            <label>
              Ülke (ISO kodu)
              <input name="country" placeholder="FI" maxLength={2} required />
            </label>
            <label>
              Faturalayan şirket
              <select name="billingEntity" defaultValue="kiqro_inc">
                <option value="kiqro_inc">Kiqro Inc.</option>
                <option value="kiqro_oy">Kiqro Oy</option>
              </select>
            </label>
            <label>
              Fatura para birimi
              <select name="invoiceCurrency" defaultValue="USD">
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
            <label>
              Geri alma süresi (gün)
              <input name="reversalWindowDays" type="number" min={1} max={90} defaultValue={30} required />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="requireSignedPostbacks" /> Postback'lerde imza zorunlu (MMP destekliyorsa)
          </label>
        </ActionForm>
      </div>
    </>
  );
}

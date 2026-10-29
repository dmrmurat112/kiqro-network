import Link from 'next/link';
import { listCampaigns } from '@kiqro/network/admin';
import { Badge } from '@/components/Badge';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const rows = await listCampaigns(db);
  return (
    <>
      <h1>Kampanyalar</h1>
      <p className="muted">Yeni kampanya için reklamverenin sayfasında ürün seçip "Kampanya oluştur"a tıklayın.</p>
      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">Henüz kampanya yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kampanya</th>
                <th>Reklamveren</th>
                <th>Ürün</th>
                <th>Ülkeler</th>
                <th>Durum</th>
                <th className="num">Harcama</th>
                <th className="num">Bütçe</th>
                <th>Oluşturulma</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ campaign, advertiserName, productName, platform, spend }) => (
                <tr key={campaign.id}>
                  <td>
                    <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
                  </td>
                  <td>
                    <Link href={`/advertisers/${campaign.orgId}`}>{advertiserName}</Link>
                  </td>
                  <td>
                    {productName} <span className="muted">({platform})</span>
                  </td>
                  <td>{campaign.countries.join(', ')}</td>
                  <td>
                    <Badge status={campaign.status} />
                  </td>
                  <td className="num">{usd(spend)}</td>
                  <td className="num">{usd(campaign.totalBudget)}</td>
                  <td>{dateTime(campaign.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

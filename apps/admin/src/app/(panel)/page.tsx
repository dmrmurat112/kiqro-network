import Link from 'next/link';
import { dashboardStats } from '@kiqro/network/admin';
import { db } from '@/lib/db';
import { usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [today, week, month] = await Promise.all([dashboardStats(db, 1), dashboardStats(db, 7), dashboardStats(db, 30)]);
  const periods = [
    { label: 'Son 24 saat', s: today },
    { label: 'Son 7 gün', s: week },
    { label: 'Son 30 gün', s: month },
  ];
  return (
    <>
      <h1>Genel bakış</h1>
      <div className="grid cols-4">
        <div className="card stat">
          <div className="value">{month.activeCampaigns}</div>
          <div className="label">Aktif kampanya</div>
        </div>
        <div className="card stat">
          <div className="value">{month.holdQueue}</div>
          <div className="label">
            <Link href="/conversions?status=held">İnceleme bekleyen dönüşüm</Link>
          </div>
        </div>
        <div className="card stat">
          <div className="value">{month.failedPostbacks}</div>
          <div className="label">
            <Link href="/postbacks">Başarısız yayıncı postback'i</Link>
          </div>
        </div>
        <div className="card stat">
          <div className="value">{usd(month.revenue)}</div>
          <div className="label">Kiqro geliri (30 gün)</div>
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Dönem</th>
              <th className="num">Reklamveren harcaması</th>
              <th className="num">Yayıncı payı</th>
              <th className="num">Kiqro geliri</th>
              <th className="num">Onaylı</th>
              <th className="num">Bekleyen</th>
              <th className="num">Reddedilen</th>
              <th className="num">Geri alınan</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(({ label, s }) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{usd(s.spend)}</td>
                <td className="num">{usd(s.publisherPayout)}</td>
                <td className="num">{usd(s.revenue)}</td>
                <td className="num">{s.approved}</td>
                <td className="num">{s.held}</td>
                <td className="num">{s.rejected}</td>
                <td className="num">{s.reversed}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Harcama ve gelir, dönem içinde oluşturulan onaylı dönüşümlerden hesaplanır; sonradan geri alınanlar düşülmüş olarak görünür.</p>
      </div>
    </>
  );
}

import Link from 'next/link';
import { listConversions } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { db } from '@/lib/db';
import { dateTime, REASON_LABELS, usd } from '@/lib/format';
import { reviewAction } from './actions';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { status: 'held', label: 'İnceleme bekleyen' },
  { status: 'approved', label: 'Onaylı' },
  { status: 'rejected', label: 'Reddedilen' },
  { status: 'reversed', label: 'Geri alınan' },
  { status: '', label: 'Tümü' },
];

export default async function ConversionsPage({ searchParams }: { searchParams: Promise<{ status?: string; campaignId?: string }> }) {
  const { status = '', campaignId } = await searchParams;
  const rows = await listConversions(db, { status: status || undefined, campaignId });

  return (
    <>
      <h1>Dönüşümler</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <Link key={f.label} href={`/conversions?status=${f.status}${campaignId ? `&campaignId=${campaignId}` : ''}`} className={`button small ${f.status === status ? '' : 'secondary'}`}>
            {f.label}
          </Link>
        ))}
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">Kayıt yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Kampanya / olay</th>
                <th>Kullanıcı</th>
                <th>Durum ve nedenler</th>
                <th className="num">Reklamveren</th>
                <th className="num">Yayıncı</th>
                <th className="num">Puan</th>
                {status === 'held' && <th>İnceleme</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ conversion: c, campaignName, advertiserName, event }) => (
                <tr key={c.id}>
                  <td>{dateTime(c.createdAt)}</td>
                  <td>
                    <Link href={`/campaigns/${c.campaignId}`}>{campaignName}</Link>
                    <div className="muted">
                      {advertiserName} · <code>{event}</code>
                    </div>
                  </td>
                  <td className="mono">{c.publisherUserId}</td>
                  <td>
                    <Badge status={c.status} />
                    {c.reasons.map((r) => (
                      <div key={r} className="muted">
                        {REASON_LABELS[r] ?? r}
                      </div>
                    ))}
                    {c.reversalReason && <div className="muted">Geri alma: {c.reversalReason}</div>}
                  </td>
                  <td className="num">{usd(c.advertiserPrice)}</td>
                  <td className="num">{usd(c.publisherPayout)}</td>
                  <td className="num">{c.userRewardPoints.toString()}</td>
                  {status === 'held' && (
                    <td style={{ minWidth: 260 }}>
                      <ActionForm action={reviewAction.bind(null, c.id)} submitLabel="Uygula">
                        <input name="note" placeholder="Not (zorunlu)" required />
                        <select name="decision" defaultValue="approve">
                          <option value="approve">Onayla (faturala + ödül ver)</option>
                          <option value="reject">Reddet</option>
                        </select>
                      </ActionForm>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

import { listPublisherPostbacks, listRawPostbacks, resendPublisherPostback } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { db } from '@/lib/db';
import { runAction, type ActionState } from '@/lib/action';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function resendAction(id: string, _: ActionState): Promise<ActionState> {
  'use server';
  return runAction(async (actor) => {
    await resendPublisherPostback(db, actor, id);
    return 'Yeniden kuyruğa alındı.';
  }, '/postbacks');
}

const OUTCOME_LABELS: Record<string, string> = {
  approved: 'Onaylandı',
  held: 'Bekletildi',
  rejected: 'Reddedildi',
  duplicate: 'Tekrar',
  orphan: 'Tıklama bulunamadı',
  unknown_event: 'Tanımsız olay',
  invalid_signature: 'Geçersiz imza',
  unknown_advertiser: 'Bilinmeyen reklamveren',
  bad_request: 'Eksik parametre',
};

export default async function PostbacksPage() {
  const [failed, raw] = await Promise.all([listPublisherPostbacks(db, 'failed'), listRawPostbacks(db, 100)]);
  return (
    <>
      <h1>Postback'ler</h1>
      <div className="card">
        <h2>Başarısız yayıncı postback'leri</h2>
        {failed.length === 0 ? (
          <p className="muted">Başarısız postback yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Oluşturulma</th>
                <th>Tür</th>
                <th>Deneme</th>
                <th>Son hata</th>
                <th>URL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {failed.map((p) => (
                <tr key={p.id}>
                  <td>{dateTime(p.createdAt)}</td>
                  <td>{p.kind === 'credit' ? 'Ödül' : 'Geri alma'}</td>
                  <td>{p.attempts}</td>
                  <td>{p.lastError}</td>
                  <td className="mono" style={{ wordBreak: 'break-all', maxWidth: 420 }}>
                    {p.url}
                  </td>
                  <td>
                    <ActionForm action={resendAction.bind(null, p.id)} submitLabel="Yeniden gönder" className="row" buttonClass="small" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Son gelen MMP / S2S postback'leri</h2>
        <table>
          <thead>
            <tr>
              <th>Zaman</th>
              <th>Sonuç</th>
              <th>IP</th>
              <th>İstek</th>
            </tr>
          </thead>
          <tbody>
            {raw.map((r) => (
              <tr key={r.id}>
                <td>{dateTime(r.receivedAt)}</td>
                <td>{OUTCOME_LABELS[r.outcome ?? ''] ?? r.outcome ?? '—'}</td>
                <td className="mono">{r.ip}</td>
                <td className="mono" style={{ wordBreak: 'break-all' }}>
                  {r.url}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

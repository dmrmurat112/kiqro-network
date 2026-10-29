import Link from 'next/link';
import { decideClaim, listClaims } from '@kiqro/network';
import { AdminError, requirePermission } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { field, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  claim_not_found: 'Talep bulunamadı.',
  claim_not_open: 'Talep zaten sonuçlandırılmış.',
  claim_note_required: 'Reddetmek için gerekçe yazın.',
  claim_no_price: 'Bu adımın kullanıcının ülkesi için fiyatı yok.',
  claim_balance: 'Reklamveren bakiyesi yetersiz.',
  claim_reversed: 'Dönüşüm daha önce geri alınmış.',
};

async function decideAction(claimId: string, _: ActionState, form: FormData): Promise<ActionState> {
  'use server';
  return runAction(async (actor) => {
    requirePermission(actor, 'review');
    const approve = field(form, 'decision') === 'approve';
    const result = await decideClaim(db, claimId, { approve, note: field(form, 'note'), orgId: null, adminUserId: actor.id });
    if (!result.ok) throw new AdminError(ERRORS[result.reason] ?? result.reason);
    return approve ? 'Talep onaylandı; dönüşüm faturalandı.' : 'Talep reddedildi.';
  }, '/claims');
}

/**
 * Missing-credit claims across all advertisers. Advertisers decide their own in their panel;
 * Kiqro steps in when an advertiser does not answer or for disputes.
 */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status === 'approved' || status === 'rejected' ? status : status === 'all' ? undefined : 'open';
  const claims = await listClaims(db, { status: filter });
  const age = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

  return (
    <>
      <h1>Kayıp ödül talepleri</h1>
      <p className="muted">
        Kullanıcıların yayıncı üzerinden açtığı talepler. Reklamveren kendi panelinden karar verir; 7 günden eski açık talepleri buradan sonuçlandırın.{' '}
        {['open', 'approved', 'rejected', 'all'].map((s) => (
          <Link key={s} href={`/claims?status=${s}`} style={{ marginLeft: 8, fontWeight: (filter ?? 'all') === s ? 700 : 400 }}>
            {{ open: 'Açık', approved: 'Onaylanan', rejected: 'Reddedilen', all: 'Tümü' }[s]}
          </Link>
        ))}
      </p>
      <div className="card">
        {claims.length === 0 ? (
          <p className="muted">Talep yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Kampanya / adım</th>
                <th>Kullanıcı</th>
                <th>Tıklama</th>
                <th>Not</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>
                    {dateTime(c.createdAt)}
                    {c.status === 'open' && age(c.createdAt) >= 7 && <div className="badge failed">{age(c.createdAt)} gün</div>}
                  </td>
                  <td>
                    <Link href={`/campaigns/${c.campaignId}`}>{c.campaignName}</Link>
                    <div className="muted mono">{c.taskEvent}</div>
                  </td>
                  <td className="mono">
                    {c.publisherUserId}
                    <div className="muted">{c.placementName}</div>
                  </td>
                  <td className="mono">
                    {c.clickId}
                    <div className="muted">
                      {dateTime(c.clickedAt)} · {c.country ?? '—'}
                    </div>
                  </td>
                  <td>{c.userNote ?? '—'}{c.decisionNote && <div className="muted">→ {c.decisionNote}</div>}</td>
                  <td>
                    <Badge status={c.status === 'open' ? 'pending' : c.status} />
                  </td>
                  <td>
                    {c.status === 'open' && (
                      <ActionForm action={decideAction.bind(null, c.id)} submitLabel="Kaydet" className="row" buttonClass="small">
                        <select name="decision" defaultValue="approve">
                          <option value="approve">Onayla</option>
                          <option value="reject">Reddet</option>
                        </select>
                        <input name="note" placeholder="Gerekçe / not" />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

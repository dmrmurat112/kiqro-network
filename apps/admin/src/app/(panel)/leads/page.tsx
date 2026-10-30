import { listLeads, setLeadStatus } from '@kiqro/network/advertiser';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { field, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUSES = { new: 'Yeni', contacted: 'İletişime geçildi', qualified: 'Uygun', won: 'Kazanıldı', lost: 'Kaybedildi' } as const;

async function statusAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  'use server';
  return runAction(async (actor) => {
    await setLeadStatus(db, actor, id, field(form, 'status') as keyof typeof STATUSES);
    return 'Güncellendi.';
  }, '/leads');
}

export default async function LeadsPage() {
  const leads = await listLeads(db);
  return (
    <>
      <h1>Demo talepleri</h1>
      <p className="muted">kiqronetwork.com üzerindeki formdan gelen reklamveren talepleri.</p>
      <div className="card">
        {leads.length === 0 ? (
          <p className="muted">Henüz talep yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Kişi</th>
                <th>Şirket</th>
                <th>Kategori / bütçe</th>
                <th>Mesaj</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{dateTime(l.createdAt)}</td>
                  <td>
                    {l.name}
                    <div className="muted">
                      <a href={`mailto:${l.email}`}>{l.email}</a> · {l.locale.toUpperCase()}
                    </div>
                  </td>
                  <td>
                    {l.company}
                    {l.website && <div className="muted mono">{l.website}</div>}
                  </td>
                  <td>
                    {l.vertical ?? '—'}
                    <div className="muted">{l.monthlyBudget ?? '—'}</div>
                  </td>
                  <td style={{ maxWidth: 320 }}>{l.message ?? '—'}</td>
                  <td style={{ minWidth: 190 }}>
                    <Badge status={l.status === 'new' ? 'pending' : l.status === 'won' ? 'approved' : l.status === 'lost' ? 'rejected' : 'draft'} />
                    <ActionForm action={statusAction.bind(null, l.id)} submitLabel="Kaydet" className="row" buttonClass="small">
                      <select name="status" defaultValue={l.status} style={{ width: 'auto' }}>
                        {Object.entries(STATUSES).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
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

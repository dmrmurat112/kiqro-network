import Link from 'next/link';
import { listOrganizations } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { createPublisherAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function PublishersPage() {
  const publishers = await listOrganizations(db, 'publisher');
  return (
    <>
      <h1>Yayıncılar</h1>
      <div className="card">
        {publishers.length === 0 ? (
          <p className="muted">Henüz yayıncı yok. İlk yayıncı Kiqro uygulamasının kendisidir.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Ülke</th>
                <th className="num">Yayıncıya borç</th>
                <th>Oluşturulma</th>
              </tr>
            </thead>
            <tbody>
              {publishers.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/publishers/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.country}</td>
                  <td className="num">{usd(p.balance)}</td>
                  <td>{dateTime(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Yeni yayıncı</h2>
        <ActionForm action={createPublisherAction} submitLabel="Oluştur" resetOnSuccess>
          <div className="fields">
            <label>
              Ad
              <input name="name" required />
            </label>
            <label>
              Ülke (ISO kodu)
              <input name="country" maxLength={2} placeholder="TR" required />
            </label>
          </div>
        </ActionForm>
      </div>
    </>
  );
}

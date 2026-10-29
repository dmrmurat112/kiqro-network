import Link from 'next/link';
import QRCode from 'qrcode';
import { totpUri } from '@kiqro/core';
import { startTotpEnrollment } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { logoutAction } from '../login/actions';
import { confirmTotpAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const user = await requireAdmin({ allowWithoutTotp: true });

  if (user.totpEnabledAt) {
    return (
      <div className="login">
        <div className="card">
          <h1>Güvenlik</h1>
          <p className="notice ok">İki aşamalı doğrulama etkin.</p>
          <p>
            <Link href="/">Panele dön</Link>
          </p>
        </div>
      </div>
    );
  }

  // Reuse a pending secret so reloading the page does not invalidate an already scanned QR code.
  const secret = user.totpSecret ?? (await startTotpEnrollment(db, user));
  const svg = await QRCode.toString(totpUri(secret, user.email), { type: 'svg', margin: 1, width: 200 });

  return (
    <div className="login">
      <div className="card" style={{ width: 420 }}>
        <h1>İki aşamalı doğrulama</h1>
        <p>Panel para hareketlerine erişim verdiği için iki aşamalı doğrulama zorunludur.</p>
        <ol className="muted">
          <li>Google Authenticator, Microsoft Authenticator veya 1Password ile aşağıdaki QR kodu okutun.</li>
          <li>Uygulamanın gösterdiği 6 haneli kodu girin.</li>
        </ol>
        <div style={{ display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="muted">
          QR okutamıyorsanız anahtar: <code>{secret.match(/.{1,4}/g)!.join(' ')}</code>
        </p>
        <ActionForm action={confirmTotpAction} submitLabel="Etkinleştir">
          <label>
            6 haneli kod
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
          </label>
        </ActionForm>
        <form action={logoutAction} style={{ marginTop: 12 }}>
          <button type="submit" className="secondary small">Çıkış</button>
        </form>
      </div>
    </div>
  );
}

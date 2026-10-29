import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { logoutAction } from '../login/actions';

const ROLE_LABELS = { admin: 'Yönetici', operator: 'Operasyon', finance: 'Finans', viewer: 'İzleyici' } as const;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">KIQRO NETWORK</div>
        <Link href="/">Genel bakış</Link>
        <Link href="/advertisers">Reklamverenler</Link>
        <Link href="/campaigns">Kampanyalar</Link>
        <Link href="/conversions?status=held">Dönüşüm inceleme</Link>
        <Link href="/claims">Kayıp ödül talepleri</Link>
        <Link href="/leads">Demo talepleri</Link>
        <Link href="/publishers">Yayıncılar</Link>
        <Link href="/postbacks">Postback'ler</Link>
        <div className="user">
          <div>{admin.name}</div>
          <div>{ROLE_LABELS[admin.role]}</div>
          <form action={logoutAction}>
            <button type="submit" className="secondary small">Çıkış</button>
          </form>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

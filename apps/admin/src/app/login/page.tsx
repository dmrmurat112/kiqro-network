import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await currentAdmin()) redirect('/');
  return (
    <div className="login">
      <div className="card">
        <h1>Kiqro Network</h1>
        <p className="muted">Yönetim paneline giriş</p>
        <LoginForm />
      </div>
    </div>
  );
}

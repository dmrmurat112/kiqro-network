import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/ActionForm';
import { currentAdmin } from '@/lib/session';
import { loginAction } from './actions';

export default async function LoginPage() {
  if (await currentAdmin()) redirect('/');
  return (
    <div className="login">
      <div className="card">
        <h1>Kiqro Network</h1>
        <p className="muted">Yönetim paneline giriş</p>
        <ActionForm action={loginAction} submitLabel="Giriş yap">
          <label>
            E-posta
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Parola
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        </ActionForm>
      </div>
    </div>
  );
}

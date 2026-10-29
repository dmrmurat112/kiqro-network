'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="stack">
      <label>
        E-posta
        <input name="email" type="email" autoComplete="username" defaultValue={state?.email} required />
      </label>
      <label>
        Parola
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.needCode && (
        <label>
          Doğrulama uygulamasındaki 6 haneli kod
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus required />
        </label>
      )}
      <div className="row">
        <button type="submit" disabled={pending}>
          {pending ? 'Kontrol ediliyor…' : state?.needCode ? 'Doğrula ve giriş yap' : 'Giriş yap'}
        </button>
      </div>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.needCode && !state.error && <div className="notice info">Parolayı tekrar girip doğrulama kodunu yazın.</div>}
    </form>
  );
}

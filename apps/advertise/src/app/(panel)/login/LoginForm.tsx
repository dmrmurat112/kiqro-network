'use client';

import { useActionState } from 'react';
import type { PanelDictT } from '@/lib/i18n';
import { loginAction } from '../actions';

export function LoginForm({ t }: { t: PanelDictT['login'] }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="mt-6 grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.email}</span>
        <input name="email" type="email" className="field" autoComplete="username" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.password}</span>
        <input name="password" type="password" className="field" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error === 'locked' ? t.locked : t.invalid}</p>}
      <button type="submit" className="btn-primary mt-1 justify-center" disabled={pending}>
        {pending ? '…' : t.submit}
      </button>
    </form>
  );
}

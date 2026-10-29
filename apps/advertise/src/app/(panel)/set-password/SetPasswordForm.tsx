'use client';

import { useActionState } from 'react';
import type { PanelDictT } from '@/lib/i18n';
import { setPasswordAction } from '../password-actions';

export function SetPasswordForm({ token, t, email }: { token: string; t: PanelDictT['setPassword']; email: string }) {
  const [state, action, pending] = useActionState(setPasswordAction.bind(null, token), undefined);
  return (
    <form action={action} className="mt-6 grid gap-4">
      {/* Lets password managers store the new password against the right account. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.password}</span>
        <input name="password" type="password" className="field" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.confirm}</span>
        <input name="confirm" type="password" className="field" autoComplete="new-password" minLength={12} required />
      </label>
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error === 'mismatch' ? t.mismatch : state.error === 'weak' ? t.weak : t.invalid}</p>}
      <button type="submit" className="btn-primary justify-center" disabled={pending}>
        {pending ? '…' : t.submit}
      </button>
    </form>
  );
}

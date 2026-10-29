'use client';

import { useActionState } from 'react';
import type { PanelDictT } from '@/lib/i18n';
import { changePasswordAction } from '../../actions';

export function PasswordForm({ t }: { t: PanelDictT['account'] }) {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.current}</span>
        <input name="current" type="password" className="field" autoComplete="current-password" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.next}</span>
        <input name="next" type="password" className="field" autoComplete="new-password" minLength={12} required />
      </label>
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-good/10 px-3 py-2 text-sm text-good">{t.saved}</p>}
      <button type="submit" className="btn-primary justify-center" disabled={pending}>
        {t.save}
      </button>
    </form>
  );
}

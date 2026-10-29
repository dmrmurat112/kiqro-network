'use client';

import { useActionState } from 'react';
import { MailCheck } from 'lucide-react';
import type { PanelDictT } from '@/lib/i18n';
import { requestResetAction } from '../password-actions';

export function ForgotForm({ t, emailLabel }: { t: PanelDictT['forgot']; emailLabel: string }) {
  const [state, action, pending] = useActionState(requestResetAction, undefined);
  if (state?.sent) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-xl bg-good/10 px-4 py-3 text-sm text-good">
        <MailCheck size={18} className="mt-0.5 shrink-0" />
        {t.sent}
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{emailLabel}</span>
        <input name="email" type="email" className="field" autoComplete="username" required />
      </label>
      <button type="submit" className="btn-primary justify-center" disabled={pending}>
        {pending ? '…' : t.submit}
      </button>
    </form>
  );
}

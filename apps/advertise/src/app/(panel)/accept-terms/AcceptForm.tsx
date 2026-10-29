'use client';

import { useActionState } from 'react';
import type { PanelDictT } from '@/lib/i18n';
import { acceptTermsAction } from './actions';

export function AcceptForm({ t }: { t: PanelDictT['terms'] }) {
  const [state, action, pending] = useActionState(acceptTermsAction, undefined);
  return (
    <form action={action} className="mt-5 grid gap-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="accept" className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500" />
        <span className="text-muted">{t.checkbox}</span>
      </label>
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{t.required}</p>}
      <button type="submit" className="btn-primary justify-center" disabled={pending}>
        {t.submit}
      </button>
    </form>
  );
}

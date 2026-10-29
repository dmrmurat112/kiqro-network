'use client';

import { useActionState } from 'react';
import type { PanelDictT } from '@/lib/i18n';
import { billingDetailsAction } from './actions';

interface Values {
  legalName: string;
  billingAddress: string;
  vatId: string;
  billingEmail: string;
}

export function BillingDetailsForm({ t, values }: { t: PanelDictT['account']; values: Values }) {
  const [state, action, pending] = useActionState(billingDetailsAction, undefined);
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;
  const field = (name: keyof Values, label: string, opts: { hint?: string; multiline?: boolean; type?: string } = {}) => (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {opts.multiline ? (
        <textarea name={name} defaultValue={values[name]} rows={3} className="field resize-y" />
      ) : (
        <input name={name} type={opts.type ?? 'text'} defaultValue={values[name]} className="field" />
      )}
      {issue(name) ? <span className="text-xs text-bad">{issue(name)}</span> : opts.hint && <span className="text-xs text-subtle">{opts.hint}</span>}
    </label>
  );
  return (
    <form action={action} className="grid gap-4">
      {field('legalName', t.legalName)}
      {field('billingAddress', t.address, { multiline: true })}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('vatId', t.vatId, { hint: t.vatHint })}
        {field('billingEmail', t.billingEmail, { hint: t.billingEmailHint, type: 'email' })}
      </div>
      {state?.ok && <p className="rounded-lg bg-good/10 px-3 py-2 text-sm text-good">{t.detailsSaved}</p>}
      <button type="submit" className="btn-primary justify-center sm:justify-self-start" disabled={pending}>
        {t.saveDetails}
      </button>
    </form>
  );
}

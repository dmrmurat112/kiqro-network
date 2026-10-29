'use client';

import { useActionState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { requestDemoAction, type DemoState } from '@/app/(site)/[lang]/actions';
import type { Locale, SiteDict } from '@/lib/i18n';

export function DemoForm({ lang, t }: { lang: Locale; t: SiteDict['demo'] }) {
  const [state, action, pending] = useActionState<DemoState, FormData>(requestDemoAction, { status: 'idle' });
  const bad = (field: string) => (state.fields?.includes(field) ? '!border-bad' : '');

  if (state.status === 'success') {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-good/15 text-good">
          <CheckCircle2 size={30} />
        </div>
        <p className="max-w-sm text-lg font-medium">{t.success}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="locale" value={lang} />
      <input type="text" name="company_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.name}</span>
        <input name="name" className={`field ${bad('name')}`} autoComplete="name" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.email}</span>
        <input name="email" type="email" className={`field ${bad('email')}`} autoComplete="email" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.company}</span>
        <input name="company" className={`field ${bad('company')}`} autoComplete="organization" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.website}</span>
        <input name="website" className={`field ${bad('website')}`} placeholder="play.google.com/…" />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.vertical}</span>
        <select name="vertical" className="field" defaultValue="games">
          {Object.entries(t.verticals).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.budget}</span>
        <select name="monthlyBudget" className="field" defaultValue="5k-20k">
          {Object.entries(t.budgets).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        <span className="text-muted">{t.message}</span>
        <textarea name="message" rows={3} className="field resize-none" />
      </label>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-subtle">{t.privacy}</p>
        <button type="submit" className="btn-primary justify-center" disabled={pending}>
          {pending ? t.sending : t.submit}
          {!pending && <ArrowRight size={16} />}
        </button>
      </div>
      {state.status === 'invalid' && <p className="text-sm text-bad sm:col-span-2">{t.invalid}</p>}
      {state.status === 'rate_limited' && <p className="text-sm text-bad sm:col-span-2">{t.rateLimited}</p>}
    </form>
  );
}

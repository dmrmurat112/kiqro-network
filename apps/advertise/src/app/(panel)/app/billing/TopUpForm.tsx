'use client';

import { useActionState, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import type { Locale, PanelDictT } from '@/lib/i18n';
import { topUpAction } from './actions';

const PRESETS = [500, 1000, 2500, 5000];

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

export function TopUpForm({ t, lang, min, max }: { t: PanelDictT['billing']; lang: Locale; min: number; max: number }) {
  const [state, action, pending] = useActionState(topUpAction, undefined);
  const [amount, setAmount] = useState('1000');
  const fmt = (v: number) => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
  const value = Number(amount.replace(/,/g, ''));
  const valid = Number.isFinite(value) && value >= min && value <= max;

  return (
    <form action={action} className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(String(p))}
            className={`rounded-xl border px-3 py-2.5 font-mono text-sm font-semibold tabular-nums transition-colors ${
              value === p ? 'border-violet-400 bg-violet-500/15 text-fg' : 'border-line bg-surface text-muted hover:border-violet-400/50 hover:text-fg'
            }`}
          >
            {fmt(p)}
          </button>
        ))}
      </div>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.custom}</span>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-subtle">$</span>
          <input
            name="amountUsd"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="field pl-7 font-mono tabular-nums"
            aria-label={t.amount}
            required
          />
        </div>
        <span className="text-xs text-subtle">{fill(t.min, { min: fmt(min) })}</span>
      </label>
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button type="submit" className="btn-primary justify-center" disabled={pending || !valid}>
        {valid ? fill(t.pay, { amount: fmt(value) }) : t.payGeneric}
        <ArrowRight size={16} />
      </button>
      <p className="flex items-start gap-2 text-xs text-subtle">
        <Lock size={13} className="mt-0.5 shrink-0" />
        <span>
          {t.secured} {fill(t.bank, { max: fmt(max) })}
        </span>
      </p>
    </form>
  );
}

/** One-click payment of an open invoice. */
export function PayInvoiceButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const [state, action, pending] = useActionState(topUpAction, undefined);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" disabled={pending} className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-60">
        {label}
      </button>
      {state?.error && <span className="text-xs text-bad">{state.error}</span>}
    </form>
  );
}

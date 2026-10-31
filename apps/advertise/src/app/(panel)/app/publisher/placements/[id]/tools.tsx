'use client';

import { useActionState, useEffect, useRef, useTransition } from 'react';
import { Send, Sparkles, Square } from 'lucide-react';
import type { PanelDictT } from '@/lib/i18n';
import { createSaleAction, endSaleAction, testerPostbackAction } from '../../actions';

type Pl = PanelDictT['pub']['pl'];

/** Default sale window: from now until the same time in 3 days (UTC, for datetime-local inputs). */
const utcInput = (d: Date) => d.toISOString().slice(0, 16);

export function SaleForm({ id, p }: { id: string; p: Pl }) {
  const [state, action, pending] = useActionState(createSaleAction.bind(null, id), undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;
  const now = Date.now();
  return (
    <form ref={form} action={action} className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr] sm:items-end">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{p.multiplier}</span>
        <input name="multiplier" defaultValue="1.5" inputMode="decimal" className="field font-mono" />
        {issue('multiplier') && <span className="text-xs text-bad">{issue('multiplier')}</span>}
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{p.startsAt}</span>
        {/* Values are UTC: the inputs carry a trailing Z when submitted. */}
        <input name="startsAt" type="datetime-local" defaultValue={utcInput(new Date(now))} className="field" />
        {issue('startsAt') && <span className="text-xs text-bad">{issue('startsAt')}</span>}
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{p.endsAt}</span>
        <input name="endsAt" type="datetime-local" defaultValue={utcInput(new Date(now + 3 * 86_400_000))} className="field" />
        {issue('endsAt') && <span className="text-xs text-bad">{issue('endsAt')}</span>}
      </label>
      <button type="submit" className="btn-primary w-fit !py-2 text-sm sm:col-span-3" disabled={pending}>
        <Sparkles size={14} /> {p.saleCreate}
      </button>
    </form>
  );
}

export function EndSaleButton({ placementId, saleId, label }: { placementId: string; saleId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => endSaleAction(placementId, saleId))} className="btn-ghost !px-3 !py-1.5 text-xs">
      <Square size={12} /> {label}
    </button>
  );
}

export function TesterForm({ id, p, testUser }: { id: string; p: Pl; testUser: string }) {
  const [state, action, pending] = useActionState(testerPostbackAction.bind(null, id), undefined);
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          <span className="text-muted">{p.testerUser}</span>
          <input name="userId" defaultValue={testUser} className="field font-mono text-xs" />
          {issue('userId') && <span className="text-xs text-bad">{issue('userId')}</span>}
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{p.testerType}</span>
          <select name="status" className="field" defaultValue="1">
            <option value="1">{p.testerReward}</option>
            <option value="2">{p.testerReversal}</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{p.testerAmount}</span>
          <input name="amount" defaultValue="280" inputMode="numeric" className="field font-mono" />
          {issue('amount') && <span className="text-xs text-bad">{issue('amount')}</span>}
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{p.testerPayout}</span>
          <input name="payoutUsd" defaultValue="0.28" inputMode="decimal" className="field font-mono" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{p.testerOffer}</span>
          <input name="offerId" defaultValue="cmp_TEST" className="field font-mono text-xs" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{p.testerTask}</span>
          <input name="taskId" defaultValue="tsk_TEST" className="field font-mono text-xs" />
        </label>
      </div>
      <fieldset className="grid gap-1.5 text-sm">
        <legend className="mb-1.5 text-muted">{p.testerCustom}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <input key={n} name={`custom_${n}`} placeholder={`custom_${n}`} maxLength={200} className="field font-mono text-xs" />
          ))}
        </div>
      </fieldset>
      {issue('postbackUrl') && <p className="text-sm text-bad">{issue('postbackUrl')}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary !py-2 text-sm" disabled={pending}>
          <Send size={14} /> {p.testerSend}
        </button>
        {state?.status !== undefined && (
          <span className={`text-sm ${state.status >= 200 && state.status < 300 ? 'text-good' : 'text-warn'}`}>{p.testerResult.replace('{status}', String(state.status))}</span>
        )}
        {state?.error && <span className="text-sm text-bad">{p.testerFailed.replace('{error}', state.error)}</span>}
      </div>
      {state?.url && <code className="block rounded-xl border border-line bg-bg p-3 font-mono text-[0.72rem] break-all text-muted">{state.url}</code>}
    </form>
  );
}

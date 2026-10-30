'use client';

import { useActionState, useState, useTransition } from 'react';
import { Eye, Send } from 'lucide-react';
import { CopyField } from '@/components/panel/CopyField';
import type { PanelDictT } from '@/lib/i18n';
import { placementSettingsAction, testPostbackAction } from '../actions';

interface Placement {
  id: string;
  currencyName: string;
  pointsPerUsd: string;
  postbackUrl: string | null;
  secret: string;
  brandColor: string | null;
  logoUrl: string | null;
  wallTitle: string | null;
}

const SWATCHES = ['#6c57f0', '#e5466b', '#f97316', '#10b981', '#0ea5e9', '#111827'];

export function PlacementForm({ p, t, canEdit, copy }: { p: Placement; t: PanelDictT['pub']; canEdit: boolean; copy: { copy: string; copied: string } }) {
  const [state, action, pending] = useActionState(placementSettingsAction.bind(null, p.id), undefined);
  const [testing, startTest] = useTransition();
  const [test, setTest] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [color, setColor] = useState(p.brandColor ?? '');
  const [logo, setLogo] = useState(p.logoUrl ?? '');
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div>
        <div className="mb-1 text-xs text-subtle">{t.secret}</div>
        {showSecret ? (
          <CopyField value={p.secret} copyLabel={copy.copy} copiedLabel={copy.copied} />
        ) : (
          <button type="button" onClick={() => setShowSecret(true)} className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300">
            <Eye size={14} /> {t.reveal}
          </button>
        )}
      </div>
      <form action={action} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">{t.currency}</span>
            <input name="currencyName" defaultValue={p.currencyName} className="field" disabled={!canEdit} />
            {issue('currencyName') && <span className="text-xs text-bad">{issue('currencyName')}</span>}
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">{t.rate}</span>
            <input name="pointsPerUsd" defaultValue={Number(p.pointsPerUsd).toString()} inputMode="decimal" className="field font-mono" disabled={!canEdit} />
            {issue('pointsPerUsd') ? <span className="text-xs text-bad">{issue('pointsPerUsd')}</span> : <span className="text-xs text-subtle">{t.rateHint}</span>}
          </label>
        </div>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.postback}</span>
          <input name="postbackUrl" defaultValue={p.postbackUrl ?? ''} className="field font-mono text-xs" placeholder="https://api.yourapp.com/kiqro?user={user_id}&amount={amount}&tx={transaction_id}&status={status}&sig={signature}" disabled={!canEdit} />
          {issue('postbackUrl') ? <span className="text-xs text-bad">{issue('postbackUrl')}</span> : <span className="text-xs break-all text-subtle">{t.postbackHint}</span>}
        </label>
        <fieldset className="grid gap-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{t.brandTitle}</legend>
          <p className="-mt-2 text-xs text-subtle">{t.brandSub}</p>
          <div className="grid gap-1.5 text-sm">
            <span className="text-muted">{t.brandColor}</span>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-fg' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
              <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-line" title={t.brandColor} style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                <input type="color" value={color || '#6c57f0'} onChange={(e) => setColor(e.target.value)} disabled={!canEdit} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              <input name="brandColor" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#6c57f0" maxLength={7} className="field w-28 font-mono !py-1.5 text-xs" disabled={!canEdit} />
              {color && canEdit && (
                <button type="button" onClick={() => setColor('')} className="text-xs text-subtle hover:text-fg">
                  {t.brandColorDefault}
                </button>
              )}
            </div>
            {issue('brandColor') && <span className="text-xs text-bad">{issue('brandColor')}</span>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted">{t.wallHeading}</span>
              <input name="wallTitle" defaultValue={p.wallTitle ?? ''} maxLength={40} placeholder={t.wallHeadingPh} className="field" disabled={!canEdit} />
              {issue('wallTitle') && <span className="text-xs text-bad">{issue('wallTitle')}</span>}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted">{t.logoUrl}</span>
              <div className="flex items-center gap-2">
                {logo.startsWith('https://') && (
                  // eslint-disable-next-line @next/next/no-img-element -- publisher-hosted logo preview
                  <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-line object-cover" referrerPolicy="no-referrer" />
                )}
                <input name="logoUrl" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…/logo.png" className="field min-w-0 font-mono text-xs" disabled={!canEdit} />
              </div>
              {issue('logoUrl') && <span className="text-xs text-bad">{issue('logoUrl')}</span>}
            </label>
          </div>
        </fieldset>
        {state?.issues?.some((i) => i.path === '') &&<p className="text-sm text-bad">{state.issues.find((i) => i.path === '')!.message}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button type="submit" className="btn-primary !py-2 text-sm" disabled={pending}>
              {t.save}
            </button>
          )}
          {p.postbackUrl && (
            <button
              type="button"
              className="btn-ghost !py-2 text-sm"
              disabled={testing}
              onClick={() =>
                startTest(async () => {
                  const r = await testPostbackAction(p.id);
                  setTest(r.status !== undefined ? t.testOk.replace('{status}', String(r.status)) : t.testFail.replace('{error}', r.error ?? ''));
                })
              }
            >
              <Send size={14} /> {t.test}
            </button>
          )}
          {state?.ok && <span className="text-sm text-good">{t.saved}</span>}
          {test && <span className="text-sm text-muted">{test}</span>}
        </div>
      </form>
    </div>
  );
}

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
}

export function PlacementForm({ p, t, canEdit, copy }: { p: Placement; t: PanelDictT['pub']; canEdit: boolean; copy: { copy: string; copied: string } }) {
  const [state, action, pending] = useActionState(placementSettingsAction.bind(null, p.id), undefined);
  const [testing, startTest] = useTransition();
  const [test, setTest] = useState('');
  const [showSecret, setShowSecret] = useState(false);
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
        {state?.issues?.some((i) => i.path === '') && <p className="text-sm text-bad">{state.issues.find((i) => i.path === '')!.message}</p>}
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

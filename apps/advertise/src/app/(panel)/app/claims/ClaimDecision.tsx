'use client';

import { useActionState, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { PanelDictT } from '@/lib/i18n';
import { decideClaimAction } from './actions';

export function ClaimDecision({ claimId, t }: { claimId: string; t: PanelDictT['claims'] }) {
  const [state, action, pending] = useActionState(decideClaimAction.bind(null, claimId), undefined);
  const [rejecting, setRejecting] = useState(false);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
        if (decision === 'approve' && !window.confirm(t.confirmApprove)) e.preventDefault();
      }}
      className="grid gap-3"
    >
      {rejecting && (
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.reason}</span>
          <input name="note" className="field" placeholder={t.reasonPlaceholder} autoFocus required minLength={3} />
        </label>
      )}
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        {rejecting ? (
          <>
            <button type="submit" name="decision" value="reject" className="btn-ghost !py-2 text-sm" disabled={pending}>
              <X size={15} /> {t.reject}
            </button>
            <button type="button" className="text-sm text-muted hover:text-fg" onClick={() => setRejecting(false)}>
              ←
            </button>
          </>
        ) : (
          <>
            <button type="submit" name="decision" value="approve" className="btn-primary !py-2 text-sm" disabled={pending}>
              <Check size={15} /> {t.approve}
            </button>
            <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setRejecting(true)}>
              <X size={15} /> {t.reject}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

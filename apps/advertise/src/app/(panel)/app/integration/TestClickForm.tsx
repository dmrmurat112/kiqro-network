'use client';

import { useActionState } from 'react';
import { FlaskConical } from 'lucide-react';
import { CopyField } from '@/components/panel/CopyField';
import type { PanelDictT } from '@/lib/i18n';
import { createTestClickAction } from './actions';

/** Picks a campaign and creates a test click; shows the click_id to copy. */
export function TestClickForm({ t, copy, campaigns }: { t: PanelDictT['integration']['test']; copy: { copy: string; copied: string }; campaigns: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTestClickAction, undefined);
  return (
    <div className="grid gap-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-sm">
          <span className="text-muted">{t.campaign}</span>
          <select name="campaignId" className="field" defaultValue={campaigns[0]?.id}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary justify-center" disabled={pending}>
          <FlaskConical size={16} /> {t.create}
        </button>
      </form>
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.clickId && (
        <div className="grid gap-2 rounded-xl border border-good/30 bg-good/[0.06] p-4">
          <p className="text-sm font-medium">{t.created}</p>
          <CopyField value={state.clickId} copyLabel={copy.copy} copiedLabel={copy.copied} />
          <p className="text-xs text-muted">{t.wait.replace('{seconds}', String(state.ctitMinSeconds ?? 10))}</p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useActionState, useState, useTransition } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import type { PanelDictT } from '@/lib/i18n';
import { confirmTotpAction, disableTotpAction, startTotpAction, type TotpState } from './actions';

export function TwoFactorCard({ t, enabled }: { t: PanelDictT['account']; enabled: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; svg: string } | null>(null);
  const [starting, startTransition] = useTransition();
  const [confirmState, confirm, confirming] = useActionState(confirmTotpAction, undefined);
  const [disableState, disable, disabling] = useActionState(disableTotpAction, undefined);
  const on = (enabled && !disableState?.ok) || confirmState?.ok;
  const issue = (state: TotpState, path: string) => state?.issues?.find((i) => i.path === path || i.path === '')?.message;

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? 'bg-good/12 text-good' : 'bg-surface-strong text-subtle'}`}>
          {on ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
        </span>
        <p className="text-sm text-muted">{on ? t.twofaOn : t.twofaOff}</p>
      </div>

      {!on && !setup && (
        <button
          type="button"
          className="btn-primary justify-center sm:justify-self-start"
          disabled={starting}
          onClick={() => startTransition(async () => setSetup(await startTotpAction()))}
        >
          {t.twofaStart}
        </button>
      )}

      {!on && setup && (
        <form action={confirm} className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-[auto_1fr]">
          {/* QR code SVG generated on the server from the otpauth:// URI. */}
          <div className="h-[180px] w-[180px] rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.svg }} />
          <div className="grid content-start gap-3 text-sm">
            <p className="text-muted">{t.twofaScan}</p>
            <div>
              <div className="text-xs text-subtle">{t.twofaKey}</div>
              <code className="font-mono text-xs break-all select-all">{setup.secret}</code>
            </div>
            <label className="grid gap-1.5">
              <span className="text-muted">{t.twofaCode}</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="field font-mono tracking-[0.3em]" required />
            </label>
            {issue(confirmState, 'code') && <span className="text-xs text-bad">{issue(confirmState, 'code')}</span>}
            <button type="submit" className="btn-primary justify-center" disabled={confirming}>
              {t.twofaConfirm}
            </button>
          </div>
        </form>
      )}

      {confirmState?.ok && <p className="rounded-lg bg-good/10 px-3 py-2 text-sm text-good">{t.twofaEnabled}</p>}

      {on && !confirmState?.ok && (
        <form action={disable} className="grid gap-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-2">
          <p className="text-muted sm:col-span-2">{t.twofaDisableHint}</p>
          <label className="grid gap-1.5">
            <span className="text-muted">{t.twofaPassword}</span>
            <input name="password" type="password" autoComplete="current-password" className="field" required />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted">{t.twofaCode}</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="field font-mono tracking-[0.3em]" required />
          </label>
          {disableState?.issues && <span className="text-xs text-bad sm:col-span-2">{disableState.issues.map((i) => i.message).join(' · ')}</span>}
          <button type="submit" className="btn-ghost justify-center sm:justify-self-start" disabled={disabling}>
            {t.twofaDisable}
          </button>
        </form>
      )}
    </div>
  );
}

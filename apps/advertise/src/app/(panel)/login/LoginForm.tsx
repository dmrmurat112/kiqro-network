'use client';

import { useActionState, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { PanelDictT } from '@/lib/i18n';
import { loginAction } from '../actions';

export function LoginForm({ t }: { t: PanelDictT['login'] }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  // Controlled, so the e-mail and password survive the form reset after the first step
  // and are sent again together with the authenticator code.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [startOver, setStartOver] = useState(false);
  const codeStep = !startOver && (state?.error === 'totp_required' || (state?.error === 'invalid' && state.codeSent === true));

  return (
    <form action={action} onSubmit={() => setStartOver(false)} className="mt-6 grid gap-4">
      <div className={codeStep ? 'hidden' : 'grid gap-4'}>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.email}</span>
          <input name="email" type="email" className="field" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.password}</span>
          <input name="password" type="password" className="field" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      </div>
      {codeStep && (
        <>
          <div className="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 px-4 py-3 text-sm text-muted">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-violet-400" />
            {t.codeHint}
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">{t.code}</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="field text-center font-mono text-lg tracking-[0.4em]" autoFocus required />
          </label>
        </>
      )}
      {state?.error && state.error !== 'totp_required' && !startOver && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error === 'locked' ? t.locked : t.invalid}</p>
      )}
      <button type="submit" className="btn-primary mt-1 justify-center" disabled={pending}>
        {pending ? '…' : codeStep ? t.verify : t.submit}
      </button>
      {codeStep && (
        <button
          type="button"
          className="text-sm text-muted hover:text-fg"
          onClick={() => {
            setStartOver(true);
            setPassword('');
          }}
        >
          {t.back}
        </button>
      )}
    </form>
  );
}

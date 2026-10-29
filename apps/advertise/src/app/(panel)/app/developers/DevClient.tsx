'use client';

import { useActionState, useState, useTransition } from 'react';
import { Eye, KeyRound, Plus, Send, Trash2 } from 'lucide-react';
import { CopyField } from '@/components/panel/CopyField';
import type { PanelDictT } from '@/lib/i18n';
import { addEndpointAction, createKeyAction, devItemAction } from './actions';

type T = PanelDictT['developers'];
interface CopyT {
  copy: string;
  copied: string;
}

export function CreateKeyForm({ t, c }: { t: T; c: CopyT }) {
  const [state, action, pending] = useActionState(createKeyAction, undefined);
  return (
    <div className="grid gap-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-48 flex-1 gap-1.5 text-sm">
          <span className="text-muted">{t.keyName}</span>
          <input name="name" className="field" placeholder={t.keyNamePlaceholder} required minLength={2} maxLength={60} />
        </label>
        <button type="submit" className="btn-primary !py-2.5 text-sm" disabled={pending}>
          <KeyRound size={15} /> {t.createKey}
        </button>
      </form>
      {state?.issues && <p className="text-sm text-bad">{state.issues.map((i) => i.message).join(' · ')}</p>}
      {state?.key && (
        <div className="grid gap-2 rounded-xl border border-warn/30 bg-warn/8 p-3 text-sm">
          <span className="text-warn">{t.newKey}</span>
          <CopyField value={state.key} copyLabel={c.copy} copiedLabel={c.copied} />
        </div>
      )}
    </div>
  );
}

export function AddEndpointForm({ t, c, events }: { t: T; c: CopyT; events: readonly string[] }) {
  const [state, action, pending] = useActionState(addEndpointAction, undefined);
  return (
    <div className="grid gap-3">
      <form action={action} className="grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.url}</span>
          <input name="url" type="url" className="field font-mono" placeholder="https://api.yourstudio.com/kiqro/webhooks" required />
        </label>
        <fieldset className="grid gap-1.5 text-sm">
          <legend className="mb-1.5 text-muted">{t.events}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {events.map((e) => (
              <label key={e} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-500/10">
                <input type="checkbox" name="events" value={e} defaultChecked={e.startsWith('conversion.')} className="accent-violet-500" />
                <span>{t.eventNames[e] ?? e}</span>
                <code className="ml-auto text-[0.7rem] text-subtle">{e}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn-primary justify-center !py-2.5 text-sm sm:justify-self-start" disabled={pending}>
          <Plus size={15} /> {t.addEndpoint}
        </button>
      </form>
      {state?.issues && <p className="text-sm text-bad">{state.issues.map((i) => i.message).join(' · ')}</p>}
      {state?.secret && (
        <div className="grid gap-2 rounded-xl border border-good/30 bg-good/8 p-3 text-sm">
          <span className="text-good">{t.secret}</span>
          <CopyField value={state.secret} copyLabel={c.copy} copiedLabel={c.copied} />
        </div>
      )}
    </div>
  );
}

/** Revoke / remove / test buttons for one key or endpoint. */
export function ItemButton({ op, id, label, confirm, danger = false, doneLabel }: { op: 'revoke' | 'remove' | 'test'; id: string; label: string; confirm?: string; danger?: boolean; doneLabel?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const Icon = op === 'test' ? Send : Trash2;
  return (
    <span className="inline-flex items-center gap-2">
      {msg && <span className="text-xs text-good">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await devItemAction(op, id);
            setMsg(r?.issues ? r.issues.map((i) => i.message).join(' · ') : (doneLabel ?? ''));
          });
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${danger ? 'text-bad hover:bg-bad/10' : 'text-muted hover:bg-surface-strong hover:text-fg'}`}
      >
        <Icon size={13} /> {label}
      </button>
    </span>
  );
}

export function SecretReveal({ secret, t, c }: { secret: string; t: T; c: CopyT }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <CopyField value={secret} copyLabel={c.copy} copiedLabel={c.copied} />
  ) : (
    <button type="button" onClick={() => setShown(true)} className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300">
      <Eye size={13} /> {t.secret}: {t.reveal}
    </button>
  );
}


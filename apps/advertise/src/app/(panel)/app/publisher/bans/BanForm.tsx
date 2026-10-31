'use client';

import { useActionState, useEffect, useRef, useTransition } from 'react';
import { Ban, Undo2 } from 'lucide-react';
import type { PanelDictT } from '@/lib/i18n';
import { banUserAction, unbanUserAction } from '../actions';

export function BanForm({ t }: { t: PanelDictT['pub'] }) {
  const [state, action, pending] = useActionState(banUserAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;
  return (
    <form ref={form} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.banUser}</span>
        <input name="userId" className="field font-mono text-sm" maxLength={200} required />
        {issue('userId') && <span className="text-xs text-bad">{issue('userId')}</span>}
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{t.banReason}</span>
        <input name="reason" className="field" maxLength={300} />
      </label>
      <button type="submit" className="btn-primary !py-2.5 text-sm" disabled={pending}>
        <Ban size={14} /> {t.banAdd}
      </button>
    </form>
  );
}

export function UnbanButton({ userId, label }: { userId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => unbanUserAction(userId))} className="btn-ghost !px-3 !py-1.5 text-xs">
      <Undo2 size={13} /> {label}
    </button>
  );
}

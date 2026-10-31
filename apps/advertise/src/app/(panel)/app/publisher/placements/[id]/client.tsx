'use client';

import { useActionState, useState, useTransition } from 'react';
import { Eye, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { CopyField } from '@/components/panel/CopyField';
import type { PanelDictT } from '@/lib/i18n';
import { deletePlacementAction, placementProfileAction, placementStatusAction } from '../../actions';

type Pl = PanelDictT['pub']['pl'];

/** Name and store page / website, shown as text with an inline edit form. */
export function ProfileRows({ id, name, storeUrl, needsStore, canEdit, p }: { id: string; name: string; storeUrl: string | null; needsStore: boolean; canEdit: boolean; p: Pl }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof placementProfileAction>>, form: FormData) => {
    const r = await placementProfileAction(id, prev, form);
    if (r?.ok) setEditing(false);
    return r;
  }, undefined);
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;

  if (!editing) {
    return (
      <>
        <Row label={p.name}>
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate font-medium">{name}</span>
            {canEdit && (
              <button type="button" onClick={() => setEditing(true)} className="btn-ghost shrink-0 !px-2.5 !py-1 text-xs">
                <Pencil size={12} /> {p.edit}
              </button>
            )}
          </span>
        </Row>
        <Row label={p.store}>
          {storeUrl ? (
            <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-xs text-violet-300 hover:underline">
              {storeUrl}
            </a>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </Row>
      </>
    );
  }
  return (
    <form action={action} className="grid gap-3 border-b border-line px-5 py-4 sm:px-6">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{p.name}</span>
        <input name="name" defaultValue={name} maxLength={80} className="field" autoFocus />
        {issue('name') && <span className="text-xs text-bad">{issue('name')}</span>}
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted">{needsStore ? p.site : p.storeOptional}</span>
        <input name="storeUrl" defaultValue={storeUrl ?? ''} className="field font-mono text-xs" placeholder="https://…" />
        {issue('storeUrl') && <span className="text-xs text-bad">{issue('storeUrl')}</span>}
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary !py-1.5 text-sm" disabled={pending}>
          {p.save}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost !py-1.5 text-sm">
          {p.cancel}
        </button>
      </div>
    </form>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line px-5 py-3.5 last:border-0 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-4 sm:px-6">
      <span className="text-sm text-muted">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function SecretField({ secret, copy, reveal }: { secret: string; copy: { copy: string; copied: string }; reveal: string }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <CopyField value={secret} copyLabel={copy.copy} copiedLabel={copy.copied} />
  ) : (
    <button type="button" onClick={() => setShown(true)} className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300">
      <Eye size={14} /> {reveal}
    </button>
  );
}

export function StatusButton({ id, status, p }: { id: string; status: string; p: Pl }) {
  const [pending, start] = useTransition();
  const live = status === 'active';
  return (
    <button type="button" disabled={pending} onClick={() => start(() => placementStatusAction(id, live ? 'paused' : 'active'))} className={live ? 'btn-ghost !py-2 text-sm' : 'btn-primary !py-2 text-sm'}>
      {live ? <Pause size={14} /> : <Play size={14} />} {live ? p.pause : p.resume}
    </button>
  );
}

export function DeleteButton({ id, p }: { id: string; p: Pl }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(p.deleteConfirm)) return;
          setError('');
          start(async () => {
            const r = await deletePlacementAction(id);
            if (r?.issues?.length) setError(r.issues.map((i) => i.message).join(' · '));
          });
        }}
        className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-bad/40 px-3 py-2 text-sm text-bad transition-colors hover:bg-bad/10"
      >
        <Trash2 size={14} /> {p.delete}
      </button>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

'use client';

import { useActionState, useState, useTransition } from 'react';
import { Mail, MoreHorizontal, ShieldCheck, UserPlus } from 'lucide-react';
import type { Locale, PanelDictT } from '@/lib/i18n';
import { inviteAction, memberAction } from './actions';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  twoFactor: boolean;
  pending: boolean;
  lastLogin: string | null;
}

export function InviteForm({ t, lang }: { t: PanelDictT['team']; lang: Locale }) {
  const [state, action, pending] = useActionState(inviteAction, undefined);
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.name}</span>
          <input name="name" className="field" required />
          {issue('name') && <span className="text-xs text-bad">{issue('name')}</span>}
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.email}</span>
          <input name="email" type="email" className="field" required />
          {issue('email') && <span className="text-xs text-bad">{issue('email')}</span>}
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.role}</span>
          <select name="role" className="field" defaultValue="member">
            <option value="member">{t.roles.member}</option>
            <option value="admin">{t.roles.admin}</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted">{t.language}</span>
          <select name="locale" className="field" defaultValue={lang}>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </label>
      </div>
      {state?.issues?.some((i) => i.path === '') && <p className="text-sm text-bad">{state.issues.find((i) => i.path === '')!.message}</p>}
      {state?.ok && <p className="rounded-lg bg-good/10 px-3 py-2 text-sm text-good">{t.sent}</p>}
      <button type="submit" className="btn-primary justify-center sm:justify-self-start" disabled={pending}>
        <UserPlus size={16} /> {t.send}
      </button>
    </form>
  );
}

export function MemberRow({ m, t, me, canManage }: { m: Member; t: PanelDictT['team']; me: boolean; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const run = (op: 'admin' | 'member' | 'resend' | 'remove') => {
    if (op === 'remove' && !window.confirm(t.removeConfirm.replace('{name}', m.name))) return;
    setOpen(false);
    setError('');
    startTransition(async () => {
      const result = await memberAction(m.id, op);
      if (result?.issues) setError(result.issues.map((i) => i.message).join(' · '));
    });
  };
  const initials = m.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <li className={`flex items-center gap-3 px-5 py-4 ${pending ? 'opacity-60' : ''}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-orange-400 text-sm font-semibold text-white">{initials}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{m.name}</span>
          {me && <span className="text-xs text-subtle">({t.you})</span>}
          <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${m.role === 'admin' ? 'bg-violet-500/15 text-violet-300' : 'bg-surface-strong text-muted'}`}>{t.roles[m.role]}</span>
          {m.twoFactor && (
            <span className="flex items-center gap-1 rounded-full bg-good/12 px-2 py-0.5 text-[0.7rem] font-semibold text-good">
              <ShieldCheck size={11} /> {t.twoFactor}
            </span>
          )}
        </div>
        <div className="truncate text-sm text-subtle">
          {m.email} · {m.pending ? <span className="text-warn">{t.pending}</span> : `${t.lastLogin}: ${m.lastLogin}`}
        </div>
        {error && <div className="mt-1 text-xs text-bad">{error}</div>}
      </div>
      {canManage && !me && (
        <div className="relative">
          <button type="button" onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-lg text-subtle hover:bg-surface-strong hover:text-fg" aria-label="…">
            <MoreHorizontal size={18} />
          </button>
          {open && (
            <div className="absolute right-0 z-20 mt-1 grid min-w-48 gap-0.5 rounded-xl border border-line bg-elevated p-1 text-sm shadow-xl">
              <MenuItem onClick={() => run(m.role === 'admin' ? 'member' : 'admin')}>{m.role === 'admin' ? t.makeMember : t.makeAdmin}</MenuItem>
              {m.pending && (
                <MenuItem onClick={() => run('resend')}>
                  <Mail size={14} /> {t.resend}
                </MenuItem>
              )}
              <MenuItem onClick={() => run('remove')} danger>
                {t.remove}
              </MenuItem>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MenuItem({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left ${danger ? 'text-bad hover:bg-bad/10' : 'hover:bg-surface-strong'}`}>
      {children}
    </button>
  );
}

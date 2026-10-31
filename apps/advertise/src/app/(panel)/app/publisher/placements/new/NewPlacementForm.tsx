'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { CheckCircle2, Loader2, SearchX } from 'lucide-react';
import type { FieldIssue, StoreApp } from '@kiqro/network';
import type { PanelDictT } from '@/lib/i18n';
import { createPlacementAction, lookupPlacementAppAction } from '../../actions';
import { PlacementIcon, TYPES, TypeIcon, type PlacementType } from '../shared';

export function NewPlacementForm({ t }: { t: PanelDictT['pub'] }) {
  const p = t.pl;
  const [type, setType] = useState<PlacementType | null>(null);
  const [released, setReleased] = useState<boolean | null>(null);
  const [store, setStore] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [iconUrl, setIconUrl] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [currencyName, setCurrencyName] = useState('');
  const [pointsPerUsd, setPointsPerUsd] = useState('1000');
  const [postbackUrl, setPostbackUrl] = useState('');
  const [lookup, setLookup] = useState<{ state: 'idle' | 'loading' | 'found' | 'missing'; app?: StoreApp }>({ state: 'idle' });
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const issue = (path: string) => issues.find((i) => i.path === path)?.message;

  const isApp = type === 'android' || type === 'ios';
  // Store apps ask whether they are released; a released app (and every website) is looked up.
  const showForm = type !== null && (!isApp || released !== null);
  const lookupKind = isApp && released ? type : type === 'web' ? 'web' : null;

  useEffect(() => {
    const raw = store.trim();
    if (!lookupKind || raw.length < 4) {
      setLookup({ state: 'idle' });
      setStoreUrl(type === 'api' ? raw : '');
      return;
    }
    const n = ++seq.current;
    setLookup({ state: 'loading' });
    const timer = setTimeout(async () => {
      const app = await lookupPlacementAppAction(raw, lookupKind).catch(() => null);
      if (n !== seq.current) return;
      if (!app) {
        setLookup({ state: 'missing' });
        setIconUrl('');
        setStoreUrl(/^https:\/\//.test(raw) ? raw : '');
        return;
      }
      setLookup({ state: 'found', app });
      setIconUrl(app.iconUrl);
      setStoreUrl(
        app.platform === 'android'
          ? `https://play.google.com/store/apps/details?id=${app.storeId}`
          : app.platform === 'ios'
            ? `https://apps.apple.com/app/id${app.storeId}`
            : `https://${app.storeId}`,
      );
      if (!nameTouched) setName(app.name);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the store input or kind changes
  }, [store, lookupKind]);

  function choose(next: PlacementType) {
    setType(next);
    setReleased(null);
    setStore('');
    setIconUrl('');
    setStoreUrl('');
    setLookup({ state: 'idle' });
    setIssues([]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    setIssues([]);
    start(async () => {
      const result = await createPlacementAction({ type, name, storeUrl: type === 'api' ? store.trim() : storeUrl, iconUrl, currencyName, pointsPerUsd, postbackUrl });
      if (result?.issues?.length) setIssues(result.issues);
    });
  }

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-3xl gap-7">
      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">{p.chooseType}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup">
          {TYPES.map((ty) => {
            const on = type === ty;
            return (
              <button
                key={ty}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(ty)}
                className={`group grid justify-items-center gap-2 rounded-2xl border p-4 text-center transition-all duration-300 ${
                  on ? 'border-violet-500 bg-violet-500/12 shadow-[0_0_0_3px_rgb(108_87_240/0.18)]' : 'border-line bg-surface hover:-translate-y-0.5 hover:border-line-strong'
                }`}
              >
                <span className={`grid h-11 w-11 place-items-center rounded-xl transition-colors ${on ? 'bg-violet-500 text-white' : 'bg-surface-strong text-muted group-hover:text-fg'}`}>
                  <TypeIcon type={ty} size={20} />
                </span>
                <span className="text-sm font-semibold">{p.typeLong[ty]}</span>
                <span className="text-[0.72rem] leading-snug text-subtle">{p.typeHint[ty]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {isApp && (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold">{p.released}</h2>
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => {
                  setReleased(v);
                  setStore('');
                }}
                className={`rounded-xl border px-4 py-2 text-sm transition-colors ${released === v ? 'border-violet-500 bg-violet-500/12 text-fg' : 'border-line text-muted hover:text-fg'}`}
              >
                {v ? p.yes : p.no}
              </button>
            ))}
          </div>
        </section>
      )}

      {showForm && (
        <section className="grid gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          {(lookupKind || type === 'api') && (
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted">{type === 'web' ? p.site : type === 'api' ? p.storeOptional : p.storeLink}</span>
              <div className="relative">
                <input
                  className="field !pr-10 font-mono text-xs"
                  spellCheck={false}
                  autoComplete="off"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  placeholder={type === 'web' ? 'https://www.example.com' : type === 'api' ? 'https://…' : type === 'ios' ? 'https://apps.apple.com/app/id123456789' : 'https://play.google.com/store/apps/details?id=com.example'}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  {lookup.state === 'loading' && <Loader2 size={16} className="animate-spin text-subtle" />}
                  {lookup.state === 'found' && <CheckCircle2 size={16} className="text-good" />}
                  {lookup.state === 'missing' && <SearchX size={16} className="text-warn" />}
                </span>
              </div>
              {issue('storeUrl') ? (
                <span className="text-xs text-bad">{issue('storeUrl')}</span>
              ) : lookup.state === 'missing' ? (
                <span className="text-xs text-warn">{p.notFound}</span>
              ) : (
                lookupKind && type !== 'web' && <span className="text-xs text-subtle">{p.storeLinkHint}</span>
              )}
            </label>
          )}

          {lookup.state === 'found' && lookup.app && (
            <div className="flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 p-3">
              <PlacementIcon type={type!} iconUrl={lookup.app.iconUrl || null} size={48} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{lookup.app.name}</div>
                {lookup.app.developer && <div className="truncate text-sm text-muted">{lookup.app.developer}</div>}
                <div className="truncate font-mono text-xs text-subtle">{lookup.app.storeId}</div>
              </div>
            </div>
          )}

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">{p.name}</span>
            <input
              className="field"
              value={name}
              maxLength={80}
              placeholder="Kiqro Android"
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
            />
            {issue('name') && <span className="text-xs text-bad">{issue('name')}</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted">{p.reward}</span>
              <input className="field" value={currencyName} maxLength={40} placeholder="Puan, Coins, TL…" onChange={(e) => setCurrencyName(e.target.value)} />
              {issue('currencyName') && <span className="text-xs text-bad">{issue('currencyName')}</span>}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted">{t.rate}</span>
              <input className="field font-mono" inputMode="decimal" value={pointsPerUsd} onChange={(e) => setPointsPerUsd(e.target.value)} />
              {issue('pointsPerUsd') ? <span className="text-xs text-bad">{issue('pointsPerUsd')}</span> : <span className="text-xs text-subtle">{t.rateHint}</span>}
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">{p.postbackOptional}</span>
            <input
              className="field font-mono text-xs"
              spellCheck={false}
              value={postbackUrl}
              onChange={(e) => setPostbackUrl(e.target.value)}
              placeholder="https://api.yourapp.com/kiqro?user={user_id}&amount={amount}&tx={transaction_id}&status={status}&sig={signature}"
            />
            {issue('postbackUrl') ? <span className="text-xs text-bad">{issue('postbackUrl')}</span> : <span className="text-xs break-all text-subtle">{t.postbackHint}</span>}
          </label>

          {issues.some((i) => i.path === '' || i.path === 'type') && <p className="text-sm text-bad">{issues.find((i) => i.path === '' || i.path === 'type')!.message}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary !py-2.5 text-sm" disabled={pending}>
              {pending && <Loader2 size={15} className="animate-spin" />} {p.create}
            </button>
            <Link href="/app/publisher/placements" className="text-sm text-muted hover:text-fg">
              {p.cancel}
            </Link>
          </div>
        </section>
      )}
    </form>
  );
}

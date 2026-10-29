'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertCircle, Apple, Check, CheckCircle2, ChevronDown, Globe, Loader2, Pencil, Plus, SearchX, Smartphone, Trash2, X } from 'lucide-react';
import type { CampaignInput } from '@kiqro/network/admin';
import type { FieldIssue, StoreApp } from '@kiqro/network';
import { createProductAction, deleteProductAction, lookupStoreAppAction, saveCampaignAction, updateProductAction } from '@/app/(panel)/app/campaigns/actions';
import type { PanelDictT } from '@/lib/i18n';

type Task = CampaignInput['tasks'][number];
type Product = { id: string; name: string; platform: string; storeId: string; mmp: string | null; iconUrl?: string | null };

interface Props {
  t: PanelDictT['wizard'];
  lang: 'en' | 'tr';
  products: Product[];
  initial?: CampaignInput;
  campaignId?: string;
  reviewNote?: string | null;
  returnedTitle: string;
}

const POPULAR = ['FI', 'SE', 'NO', 'DK', 'DE', 'AT', 'CH', 'NL', 'GB', 'US', 'TR', 'PL'];
const MMPS = ['appsflyer', 'adjust', 'singular', 'kochava', 'branch', 'tenjin', 'none'];
const MMP_LABEL: Record<string, string> = { appsflyer: 'AppsFlyer', adjust: 'Adjust', singular: 'Singular', kochava: 'Kochava', branch: 'Branch', tenjin: 'Tenjin', none: 'S2S / none' };
/** Monogram tiles for the MMP picker (letters and colours only, no third-party logos). */
const MMP_TILE: Record<string, { mark: string; tone: string }> = {
  appsflyer: { mark: 'AF', tone: 'from-emerald-400 to-sky-500' },
  adjust: { mark: 'Aj', tone: 'from-blue-500 to-indigo-600' },
  singular: { mark: 'Si', tone: 'from-violet-500 to-fuchsia-500' },
  kochava: { mark: 'Ko', tone: 'from-orange-400 to-rose-500' },
  branch: { mark: 'Br', tone: 'from-teal-400 to-emerald-600' },
  tenjin: { mark: 'Tj', tone: 'from-amber-400 to-orange-500' },
  none: { mark: 'S2S', tone: 'from-slate-500 to-slate-700' },
};

/** App icon from the store, or the platform glyph when there is none. */
function AppIcon({ iconUrl, platform, size = 40 }: { iconUrl?: string | null; platform: string; size?: number }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote store icons, no image optimizer needed
    return <img src={iconUrl} alt="" width={size} height={size} className="shrink-0 rounded-xl border border-line object-cover" style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  }
  const Icon = platform === 'ios' ? Apple : platform === 'web' ? Globe : Smartphone;
  return (
    <span className="grid shrink-0 place-items-center rounded-xl bg-surface-strong text-muted" style={{ width: size, height: size }}>
      <Icon size={size * 0.45} />
    </span>
  );
}

/** Suggested MMP event names per preset; Adjust uses per-app event tokens, so it gets none. */
const PRESETS: { key: string; en: string; tr: string; days: number; price: string; events: Record<string, string> }[] = [
  { key: 'install', en: 'Install and open', tr: 'Yükle ve aç', days: 1, price: '0.60', events: { '*': 'install' } },
  { key: 'level', en: 'Reach level 10', tr: '10. seviyeye ulaş', days: 7, price: '2.50', events: { appsflyer: 'af_level_achieved_10' } },
  { key: 'registration', en: 'Create an account', tr: 'Hesap oluştur', days: 3, price: '1.50', events: { appsflyer: 'af_complete_registration' } },
  { key: 'deposit', en: 'Make a first deposit', tr: 'İlk yatırımı yap', days: 14, price: '15.00', events: { appsflyer: 'first_deposit' } },
  { key: 'purchase', en: 'Make a purchase', tr: 'Satın alma yap', days: 14, price: '6.00', events: { appsflyer: 'af_purchase' } },
  { key: 'subscription', en: 'Start a subscription', tr: 'Abonelik başlat', days: 14, price: '8.00', events: { appsflyer: 'af_subscribe' } },
];

const STEP_FIELDS: string[][] = [['productId', 'name', 'titleEn', 'titleTr', 'descriptionEn'], ['tasks'], ['countries', 'totalBudgetUsd', 'dailyBudgetUsd', 'startAt', 'endAt'], ['trackingUrl', 'attributionWindowDays', 'ctitMinSeconds']];
const stepOf = (path: string) => {
  const i = STEP_FIELDS.findIndex((fields) => fields.some((f) => path === f || path.startsWith(`${f}.`)));
  return i === -1 ? 4 : i;
};

const emptyCampaign = (product?: { id: string; name: string }): CampaignInput => ({
  productId: product?.id ?? '',
  name: product ? `${product.name} – launch` : '',
  trackingUrl: '',
  countries: [],
  totalBudgetUsd: '',
  dailyBudgetUsd: '',
  startAt: '',
  endAt: '',
  attributionWindowDays: 7,
  ctitMinSeconds: 10,
  titleEn: product?.name ?? '',
  titleTr: '',
  descriptionEn: '',
  descriptionTr: '',
  tasks: [],
});

const money = (v: number, lang: string) => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'USD' }).format(v);

export function CampaignWizard({ t, lang, products: initialProducts, initial, campaignId, reviewNote, returnedTitle }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [c, setC] = useState<CampaignInput>(initial ?? emptyCampaign(initialProducts.length === 1 ? initialProducts[0] : undefined));
  const [step, setStepState] = useState(0);
  // Furthest step reached; an existing campaign is complete, so every step is reachable.
  const [maxStep, setMaxStep] = useState(initial ? 4 : 0);
  const setStep = (next: number) => {
    setStepState(next);
    setMaxStep((m) => Math.max(m, next));
  };
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(initialProducts.length === 0);
  const emptyApp = { platform: 'android', storeId: '', name: '', mmp: 'appsflyer', iconUrl: '' };
  const [newApp, setNewApp] = useState(emptyApp);
  const [nameTouched, setNameTouched] = useState(false);
  const [lookup, setLookup] = useState<{ state: 'idle' | 'loading' | 'found' | 'missing'; app?: StoreApp }>({ state: 'idle' });
  const lookupSeq = useRef(0);
  const [appIssues, setAppIssues] = useState<FieldIssue[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listError, setListError] = useState('');

  // Look the app up in Google Play / the App Store as the advertiser types or pastes a link.
  useEffect(() => {
    const raw = newApp.storeId.trim();
    if (raw.length < 4 || (lookup.app && raw === lookup.app.storeId && newApp.platform === lookup.app.platform)) {
      if (raw.length < 4) setLookup({ state: 'idle' });
      return;
    }
    const seq = ++lookupSeq.current;
    setLookup({ state: 'loading' });
    const timer = setTimeout(async () => {
      const app = await lookupStoreAppAction(raw, newApp.platform).catch(() => null);
      if (seq !== lookupSeq.current) return; // a newer input superseded this one
      if (!app) return setLookup({ state: 'missing' });
      setLookup({ state: 'found', app });
      setNewApp((prev) => ({ ...prev, platform: app.platform, storeId: app.storeId, iconUrl: app.iconUrl, name: nameTouched && prev.name ? prev.name : app.name }));
    }, 550);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the store input changes
  }, [newApp.storeId, newApp.platform]);
  const [code, setCode] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const regionName = useMemo(() => {
    const names = new Intl.DisplayNames([lang === 'tr' ? 'tr-TR' : 'en-US'], { type: 'region' });
    return (cc: string) => names.of(cc) ?? cc;
  }, [lang]);

  const product = products.find((p) => p.id === c.productId);
  const set = (patch: Partial<CampaignInput>) => setC((prev) => ({ ...prev, ...patch }));
  const setTask = (i: number, patch: Partial<Task>) => set({ tasks: c.tasks.map((task, j) => (j === i ? { ...task, ...patch } : task)) });
  const issueFor = (path: string) => issues.find((x) => x.path === path)?.message;

  const maxPayout = c.tasks.reduce((sum, task) => sum + Math.max(0, ...task.prices.map((p) => Number(p.priceUsd) || 0)), 0);
  const hasClickId = c.trackingUrl.includes('{click_id}');

  const canContinue = [
    Boolean(c.productId && c.name.trim().length >= 2 && c.titleEn.trim().length >= 2),
    c.tasks.length > 0 && c.tasks.every((task) => task.event.trim() && task.nameEn.trim() && task.prices.every((p) => p.country && p.priceUsd)),
    c.countries.length > 0 && Number(c.totalBudgetUsd) > 0,
    hasClickId && c.trackingUrl.startsWith('https://'),
    true,
  ][step];

  function addPreset(key: string) {
    const preset = PRESETS.find((p) => p.key === key)!;
    const event = preset.events[product?.mmp ?? ''] ?? preset.events['*'] ?? '';
    set({ tasks: [...c.tasks, { event, timeLimitDays: preset.days, nameEn: preset.en, nameTr: preset.tr, prices: [{ country: '*', priceUsd: preset.price }] }] });
  }

  function toggleCountry(cc: string) {
    set({ countries: c.countries.includes(cc) ? c.countries.filter((x) => x !== cc) : [...c.countries, cc] });
  }

  function save(intent: 'save' | 'submit') {
    setIssues([]);
    startTransition(async () => {
      const result = await saveCampaignAction(c, intent, campaignId);
      if (result?.issues?.length) {
        setIssues(result.issues);
        setStep(4);
      }
    });
  }

  function closeAppForm() {
    setAdding(false);
    setEditingId(null);
    setNewApp(emptyApp);
    setNameTouched(false);
    setLookup({ state: 'idle' });
    setAppIssues([]);
  }

  function saveApp() {
    setAppIssues([]);
    startTransition(async () => {
      const result = editingId ? await updateProductAction(editingId, newApp) : await createProductAction(newApp);
      if (!result.ok) return setAppIssues(result.issues);
      if (editingId) {
        setProducts((list) => list.map((p) => (p.id === editingId ? result.product : p)));
      } else {
        setProducts((list) => [...list, result.product]);
        set({ productId: result.product.id, titleEn: c.titleEn || result.product.name, name: c.name || `${result.product.name} – launch` });
      }
      closeAppForm();
    });
  }

  function startEdit(p: Product) {
    setListError('');
    setAppIssues([]);
    setEditingId(p.id);
    setAdding(true);
    setNameTouched(true); // keep the advertiser's own name
    setNewApp({ platform: p.platform, storeId: p.storeId, name: p.name, mmp: p.mmp ?? 'none', iconUrl: p.iconUrl ?? '' });
    // With an icon there is nothing to look up; without one the store is asked again.
    setLookup(p.iconUrl ? { state: 'found', app: { platform: p.platform as StoreApp['platform'], storeId: p.storeId, name: p.name, iconUrl: p.iconUrl, developer: null } } : { state: 'idle' });
  }

  function deleteApp(p: Product) {
    if (!window.confirm(t.app.deleteConfirm.replace('{name}', p.name))) return;
    setListError('');
    startTransition(async () => {
      const result = await deleteProductAction(p.id);
      if (!result.ok) return setListError(result.issues?.map((x) => x.message).join(' · ') ?? '');
      setProducts((list) => list.filter((x) => x.id !== p.id));
      if (c.productId === p.id) set({ productId: '' });
      if (editingId === p.id) closeAppForm();
    });
  }

  const PlatformIcon = ({ platform }: { platform: string }) => (platform === 'ios' ? <Apple size={18} /> : platform === 'web' ? <Globe size={18} /> : <Smartphone size={18} />);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        {reviewNote && (
          <div className="mb-5 rounded-2xl border border-warn/30 bg-warn/8 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-warn">
              <AlertCircle size={16} /> {returnedTitle}
            </div>
            <p className="mt-1.5 text-sm whitespace-pre-line">{reviewNote}</p>
          </div>
        )}

        {/* Stepper */}
        <ol className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {t.steps.map((label, i) => {
            const done = i < step;
            const hasIssue = issues.some((x) => stepOf(x.path) === i);
            return (
              <li key={label} className="shrink-0">
                <button
                  type="button"
                  onClick={() => i <= maxStep && setStep(i)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    i === step ? 'border-violet-500/60 bg-violet-500/12 text-fg' : done ? 'border-line bg-surface text-muted hover:text-fg' : 'border-line text-subtle'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[0.7rem] font-semibold ${
                      hasIssue ? 'bg-bad text-white' : done ? 'bg-good text-white' : i === step ? 'bg-violet-500 text-white' : 'bg-surface-strong'
                    }`}
                  >
                    {hasIssue ? '!' : done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
          {/* Step 1 — app and offer */}
          {step === 0 && (
            <div className="grid gap-6">
              <div>
                <h2 className="text-lg font-semibold">{t.app.title}</h2>
                <p className="mt-1 text-sm text-muted">{t.app.sub}</p>
              </div>
              {products.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className={`group flex items-center rounded-xl border transition-colors ${
                        editingId === p.id ? 'border-violet-400 border-dashed' : c.productId === p.id ? 'border-violet-500 bg-violet-500/10' : 'border-line hover:border-line-strong'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => set({ productId: p.id, titleEn: c.titleEn || p.name, name: c.name || `${p.name} – launch` })}
                        className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
                      >
                        <AppIcon iconUrl={p.iconUrl} platform={p.platform} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate font-mono text-xs text-subtle">{p.storeId}</span>
                        </span>
                        {c.productId === p.id && <CheckCircle2 size={18} className="shrink-0 text-violet-400" />}
                      </button>
                      <div className="flex shrink-0 gap-0.5 pr-2 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <button type="button" onClick={() => startEdit(p)} className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-surface-strong hover:text-fg" aria-label={t.app.edit} title={t.app.edit}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" onClick={() => deleteApp(p)} disabled={pending} className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-bad/10 hover:text-bad" aria-label={t.app.delete} title={t.app.delete}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {listError && <p className="-mt-2 text-sm text-bad">{listError}</p>}
              {adding ? (
                <div className="grid gap-4 rounded-xl border border-dashed border-line-strong p-4">
                  {editingId && <h3 className="font-semibold">{t.app.editTitle}</h3>}
                  <div className="flex gap-2">
                    {['android', 'ios', 'web'].map((pl) => (
                      <button
                        key={pl}
                        type="button"
                        onClick={() => setNewApp({ ...newApp, platform: pl, iconUrl: '' })}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm capitalize ${newApp.platform === pl ? 'border-violet-500 bg-violet-500/10' : 'border-line text-muted'}`}
                      >
                        <PlatformIcon platform={pl} /> {pl === 'ios' ? 'iOS' : pl}
                      </button>
                    ))}
                  </div>

                  <label className="grid gap-1.5 text-sm">
                    <span className="text-muted">{newApp.platform === 'web' ? t.app.storeId : t.app.storeLink}</span>
                    <div className="relative">
                      <input
                        className="field !pr-10 font-mono"
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={newApp.platform === 'web' ? 'example.com' : t.app.storeLinkHint}
                        value={newApp.storeId}
                        onChange={(e) => {
                          setLookup({ state: 'idle' });
                          setNewApp({ ...newApp, storeId: e.target.value, iconUrl: '' });
                        }}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                        {lookup.state === 'loading' && <Loader2 size={16} className="animate-spin text-subtle" />}
                        {lookup.state === 'found' && <CheckCircle2 size={16} className="text-good" />}
                        {lookup.state === 'missing' && <SearchX size={16} className="text-warn" />}
                      </span>
                    </div>
                    {lookup.state === 'missing' && <span className="text-xs text-warn">{t.app.notFound}</span>}
                    {lookup.state === 'idle' && <span className="text-xs text-subtle">{newApp.platform === 'web' ? t.app.siteSub : t.app.storeLinkSub}</span>}
                  </label>

                  {lookup.state === 'found' && lookup.app && (
                    <div className="flex items-center gap-4 rounded-xl border border-violet-500/30 bg-violet-500/8 p-3">
                      <AppIcon iconUrl={lookup.app.iconUrl} platform={lookup.app.platform} size={56} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{lookup.app.name}</div>
                        {lookup.app.developer && <div className="truncate text-sm text-muted">{lookup.app.developer}</div>}
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
                          {lookup.app.platform === 'ios' ? <Apple size={12} /> : lookup.app.platform === 'web' ? <Globe size={12} /> : <Smartphone size={12} />}
                          {lookup.app.platform === 'ios' ? 'App Store' : lookup.app.platform === 'web' ? 'Web' : 'Google Play'} · <span className="truncate font-mono">{lookup.app.storeId}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <label className="grid gap-1.5 text-sm">
                    <span className="text-muted">{t.app.name}</span>
                    <input
                      className="field"
                      value={newApp.name}
                      onChange={(e) => {
                        setNameTouched(true);
                        setNewApp({ ...newApp, name: e.target.value });
                      }}
                    />
                  </label>

                  <fieldset className="grid gap-2 text-sm">
                    <legend className="mb-1.5 text-muted">{t.app.mmp}</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
                      {MMPS.map((m) => {
                        const on = newApp.mmp === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setNewApp({ ...newApp, mmp: m })}
                            className={`group relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                              on ? 'border-violet-500 bg-violet-500/12 shadow-[0_0_0_3px_rgb(108_87_240/0.15)]' : 'border-line bg-surface hover:-translate-y-px hover:border-line-strong'
                            }`}
                          >
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[0.7rem] font-bold tracking-tight text-white shadow-sm ${MMP_TILE[m]!.tone}`}>
                              {MMP_TILE[m]!.mark}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{m === 'none' ? 'S2S' : MMP_LABEL[m]}</span>
                              {m === 'none' && <span className="block truncate text-[0.7rem] text-subtle">{t.app.mmpNone}</span>}
                            </span>
                            {on && <Check size={14} strokeWidth={3} className="absolute top-2 right-2 text-violet-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  {appIssues.length > 0 && <p className="text-sm text-bad">{appIssues.map((x) => x.message).join(' · ')}</p>}
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary !py-2 text-sm" onClick={saveApp} disabled={pending}>
                      {editingId ? (
                        <>
                          <Check size={15} /> {t.app.save}
                        </>
                      ) : (
                        <>
                          <Plus size={15} /> {t.app.addSubmit}
                        </>
                      )}
                    </button>
                    {(products.length > 0 || editingId) && (
                      <button type="button" className="btn-ghost !py-2 text-sm" onClick={closeAppForm}>
                        {t.app.cancel}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => (closeAppForm(), setAdding(true))} className="flex items-center gap-2 self-start text-sm font-medium text-violet-400 hover:text-violet-300">
                  <Plus size={16} /> {t.app.add}
                </button>
              )}

              {c.productId && (
                <div className="grid gap-4 border-t border-line pt-6">
                  <h3 className="font-semibold">{t.app.offer}</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-muted">{t.app.titleEn}</span>
                      <input className="field" value={c.titleEn} onChange={(e) => set({ titleEn: e.target.value })} />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-muted">{t.app.titleTr}</span>
                      <input className="field" value={c.titleTr ?? ''} onChange={(e) => set({ titleTr: e.target.value })} />
                    </label>
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <span className="text-muted">{t.app.descEn}</span>
                      <input className="field" value={c.descriptionEn ?? ''} onChange={(e) => set({ descriptionEn: e.target.value })} />
                    </label>
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <span className="text-muted">{t.app.internalName}</span>
                      <input className="field" value={c.name} onChange={(e) => set({ name: e.target.value })} />
                      <span className="text-xs text-subtle">{t.app.internalHint}</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — events and payouts */}
          {step === 1 && (
            <div className="grid gap-6">
              <div>
                <h2 className="text-lg font-semibold">{t.events.title}</h2>
                <p className="mt-1 text-sm text-muted">{t.events.sub}</p>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t.events.presets}</div>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.filter((p) => p.key !== 'install' || !c.tasks.some((x) => x.event === 'install')).map((p) => (
                    <button key={p.key} type="button" onClick={() => addPreset(p.key)} className="flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-sm text-muted hover:border-violet-400 hover:text-fg">
                      <Plus size={13} /> {t.events.presetNames[p.key]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                {c.tasks.map((task, i) => (
                  <div key={i} className="relative rounded-xl border border-line bg-bg/40 p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-violet-500/15 text-xs text-violet-300">{i + 1}</span>
                        {t.events.step} {i + 1}
                      </span>
                      <button type="button" onClick={() => set({ tasks: c.tasks.filter((_, j) => j !== i) })} className="flex items-center gap-1 text-xs text-subtle hover:text-bad">
                        <Trash2 size={14} /> {t.events.remove}
                      </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-muted">{t.events.userName}</span>
                        <input className="field" value={task.nameEn} onChange={(e) => setTask(i, { nameEn: e.target.value })} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-muted">{t.events.userNameTr}</span>
                        <input className="field" value={task.nameTr ?? ''} onChange={(e) => setTask(i, { nameTr: e.target.value })} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-muted">{t.events.eventName}</span>
                        <input className="field font-mono" placeholder={t.events.eventHint} value={task.event} onChange={(e) => setTask(i, { event: e.target.value.trim() })} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="text-muted">
                          {t.events.timeLimit} <span className="text-subtle">· {t.events.timeHint}</span>
                        </span>
                        <input className="field" type="number" min={1} max={90} value={task.timeLimitDays} onChange={(e) => setTask(i, { timeLimitDays: Number(e.target.value) })} />
                      </label>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <span className="text-sm text-muted">{t.events.price}</span>
                      {task.prices.map((price, k) => (
                        <div key={k} className="flex items-center gap-2">
                          {price.country === '*' ? (
                            <span className="w-36 shrink-0 rounded-lg bg-surface-strong px-3 py-2 text-sm text-muted">{t.events.defaultPrice}</span>
                          ) : (
                            <select
                              className="field w-36 shrink-0"
                              value={price.country}
                              onChange={(e) => setTask(i, { prices: task.prices.map((p, j) => (j === k ? { ...p, country: e.target.value } : p)) })}
                            >
                              <option value="">—</option>
                              {(c.countries.length ? c.countries : POPULAR).map((cc) => (
                                <option key={cc} value={cc}>
                                  {cc} · {regionName(cc)}
                                </option>
                              ))}
                            </select>
                          )}
                          <div className="relative w-36">
                            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle">$</span>
                            <input
                              className="field !pl-7 font-mono"
                              inputMode="decimal"
                              value={price.priceUsd}
                              onChange={(e) => setTask(i, { prices: task.prices.map((p, j) => (j === k ? { ...p, priceUsd: e.target.value.replace(',', '.') } : p)) })}
                            />
                          </div>
                          {price.country !== '*' && (
                            <button type="button" onClick={() => setTask(i, { prices: task.prices.filter((_, j) => j !== k) })} className="text-subtle hover:text-bad" aria-label="Remove">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setTask(i, { prices: [...task.prices, { country: '', priceUsd: '' }] })} className="self-start text-xs font-medium text-violet-400 hover:text-violet-300">
                        {t.events.addCountryPrice}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => set({ tasks: [...c.tasks, { event: '', timeLimitDays: 7, nameEn: '', nameTr: '', prices: [{ country: '*', priceUsd: '' }] }] })}
                  className="rounded-xl border border-dashed border-line-strong py-3 text-sm font-medium text-muted hover:border-violet-400 hover:text-fg"
                >
                  {t.events.addEvent}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — countries and budget */}
          {step === 2 && (
            <div className="grid gap-6">
              <h2 className="text-lg font-semibold">{t.targeting.title}</h2>
              <div>
                <div className="mb-1 text-sm text-muted">{t.targeting.countries}</div>
                <p className="mb-3 text-xs text-subtle">{t.targeting.countriesHint}</p>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...POPULAR, ...c.countries])].map((cc) => {
                    const on = c.countries.includes(cc);
                    return (
                      <button
                        key={cc}
                        type="button"
                        onClick={() => toggleCountry(cc)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${on ? 'border-violet-500 bg-violet-500/12 text-fg' : 'border-line text-muted hover:border-line-strong'}`}
                      >
                        <span className="font-mono text-xs text-subtle">{cc}</span>
                        {regionName(cc)}
                        {on && <Check size={14} className="text-violet-400" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex max-w-xs gap-2">
                  <input className="field font-mono uppercase" maxLength={2} placeholder="NO" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                  <button
                    type="button"
                    className="btn-ghost !py-2 text-sm"
                    onClick={() => {
                      if (/^[A-Z]{2}$/.test(code) && !c.countries.includes(code)) set({ countries: [...c.countries, code] });
                      setCode('');
                    }}
                  >
                    {t.targeting.addCode}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField label={t.targeting.totalBudget} value={c.totalBudgetUsd} onChange={(v) => set({ totalBudgetUsd: v })} error={issueFor('totalBudgetUsd')} />
                <MoneyField label={t.targeting.dailyBudget} value={c.dailyBudgetUsd ?? ''} onChange={(v) => set({ dailyBudgetUsd: v })} error={issueFor('dailyBudgetUsd')} />
                <label className="grid gap-1.5 text-sm">
                  <span className="text-muted">{t.targeting.start}</span>
                  <input className="field" type="datetime-local" value={String(c.startAt ?? '')} onChange={(e) => set({ startAt: e.target.value })} />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-muted">{t.targeting.end}</span>
                  <input className="field" type="datetime-local" value={String(c.endAt ?? '')} onChange={(e) => set({ endAt: e.target.value })} />
                </label>
              </div>
              <p className="text-xs text-subtle">{t.targeting.budgetHint}</p>
            </div>
          )}

          {/* Step 4 — tracking */}
          {step === 3 && (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-semibold">{t.tracking.title}</h2>
                <p className="mt-1 text-sm text-muted">{t.tracking.sub}</p>
              </div>
              <label className="grid gap-1.5 text-sm">
                <span className="text-muted">{t.tracking.url}</span>
                <textarea rows={3} className="field resize-none font-mono text-[0.8rem]" value={c.trackingUrl} onChange={(e) => set({ trackingUrl: e.target.value.trim() })} />
              </label>
              {c.trackingUrl && (
                <div className={`flex items-center gap-2 text-sm ${hasClickId ? 'text-good' : 'text-warn'}`}>
                  {hasClickId ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {hasClickId ? t.tracking.ok : t.tracking.missing}
                </div>
              )}
              <div className="rounded-xl border border-line bg-bg/50 p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-subtle">
                  {t.tracking.example} · {MMP_LABEL[product?.mmp ?? 'appsflyer']}
                </div>
                <code className="block font-mono text-xs break-all text-muted">
                  {product?.mmp === 'appsflyer' || !product?.mmp
                    ? `https://app.appsflyer.com/${product?.storeId ?? 'com.studio.game'}?pid=kiqro_int&clickid={click_id}&af_siteid={source_id}&af_sub1={sub_source}`
                    : `https://<your-${product.mmp}-link>?…&click_id={click_id}&source={source_id}`}
                </code>
              </div>
              <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex items-center gap-1 self-start text-sm text-muted hover:text-fg">
                <ChevronDown size={16} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} /> {t.tracking.advanced}
              </button>
              {showAdvanced && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-muted">{t.tracking.attribution}</span>
                    <input className="field" type="number" min={1} max={30} value={c.attributionWindowDays} onChange={(e) => set({ attributionWindowDays: Number(e.target.value) })} />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-muted">{t.tracking.ctit}</span>
                    <input className="field" type="number" min={0} max={3600} value={c.ctitMinSeconds} onChange={(e) => set({ ctitMinSeconds: Number(e.target.value) })} />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Step 5 — review */}
          {step === 4 && (
            <div className="grid gap-6">
              <div>
                <h2 className="text-lg font-semibold">{t.review.title}</h2>
                <p className="mt-1 text-sm text-muted">{t.review.sub}</p>
              </div>
              {issues.length > 0 && (
                <div className="rounded-xl border border-bad/30 bg-bad/8 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-bad">
                    <AlertCircle size={16} /> {t.review.problems}
                  </div>
                  <ul className="grid gap-1.5 text-sm">
                    {issues.map((x, i) => (
                      <li key={i} className="flex items-center justify-between gap-4">
                        <span>{x.message}</span>
                        {stepOf(x.path) < 4 && (
                          <button type="button" onClick={() => setStep(stepOf(x.path))} className="shrink-0 text-xs font-medium text-violet-400 hover:text-violet-300">
                            {t.review.goTo} {stepOf(x.path) + 1} →
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <ReviewItem label={t.steps[0]!} value={`${product?.name ?? '—'} · ${c.titleEn}`} />
                <ReviewItem label={t.targeting.countries} value={c.countries.join(', ') || '—'} />
                <ReviewItem label={t.targeting.totalBudget} value={c.totalBudgetUsd ? money(Number(c.totalBudgetUsd), lang) : '—'} />
                <ReviewItem label={t.events.maxPayout} value={money(maxPayout, lang)} />
              </dl>
              <div className="overflow-hidden rounded-xl border border-line">
                {c.tasks.map((task, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 text-sm last:border-b-0">
                    <span>
                      {i + 1}. {task.nameEn} <span className="font-mono text-xs text-subtle">{task.event}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs">
                      {task.prices.map((p) => `${p.country === '*' ? '★' : p.country} $${p.priceUsd}`).join(' · ')} · {task.timeLimitDays}d
                    </span>
                  </div>
                ))}
              </div>
              <p className="rounded-xl bg-violet-500/8 p-4 text-sm text-muted">{t.review.kiqroReview}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>
                {t.back}
              </button>
            )}
            {c.productId && (
              <button type="button" className="btn-ghost" onClick={() => save('save')} disabled={pending}>
                {pending ? t.saving : t.saveDraft}
              </button>
            )}
          </div>
          {step < 4 ? (
            <button type="button" className="btn-primary justify-center" onClick={() => setStep(step + 1)} disabled={!canContinue}>
              {t.next}
            </button>
          ) : (
            <button type="button" className="btn-primary justify-center" onClick={() => save('submit')} disabled={pending}>
              {pending ? t.saving : t.saveSubmit}
            </button>
          )}
        </div>
      </div>

      {/* Live summary */}
      <aside className="hidden lg:block">
        <div className="sticky top-8 grid gap-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            {product?.iconUrl ? (
              <AppIcon iconUrl={product.iconUrl} platform={product.platform} />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-orange-400 text-white">
                <PlatformIcon platform={product?.platform ?? 'android'} />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate font-semibold">{c.titleEn || product?.name || '—'}</div>
              <div className="truncate text-xs text-subtle">{product?.storeId ?? ''}</div>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            {c.tasks.map((task, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="truncate text-muted">{task.nameEn || `${t.events.step} ${i + 1}`}</span>
                <span className="font-mono text-xs">${Math.max(0, ...task.prices.map((p) => Number(p.priceUsd) || 0)).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">{t.events.maxPayout}</span>
            <span className="font-mono font-semibold">{money(maxPayout, lang)}</span>
          </div>
          {c.countries.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.countries.map((cc) => (
                <span key={cc} className="rounded-md border border-line px-1.5 py-px font-mono text-[0.7rem] text-muted">
                  {cc}
                </span>
              ))}
            </div>
          )}
          {c.totalBudgetUsd && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{t.targeting.totalBudget}</span>
              <span className="font-mono">{money(Number(c.totalBudgetUsd) || 0, lang)}</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function MoneyField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle">$</span>
        <input className={`field !pl-7 font-mono ${error ? '!border-bad' : ''}`} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(',', '.'))} />
      </div>
      {error && <span className="text-xs text-bad">{error}</span>}
    </label>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

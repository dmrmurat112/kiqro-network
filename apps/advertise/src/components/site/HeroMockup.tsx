'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { SiteDict } from '@/lib/i18n';

/** Row height + gap of the event feed (px); rows slide by exactly this much. */
const ROW = 46;
const VISIBLE = 4;

/** "4,812" / "41,6" / "$5 529" → number (admins type figures freely). */
const num = (v: string) => Number(v.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')) || 0;

/** Counts smoothly from the previous value to `value`. */
function useTween(value: number, ms = 900): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/**
 * Tilts the card towards a mouse pointer and moves a soft spotlight with it. Written straight to CSS
 * variables, so moving the mouse does not re-render React. Off for touch screens.
 */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--rx', `${(0.5 - y) * 7}deg`);
        el.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
        el.style.setProperty('--mx', `${x * 100}%`);
        el.style.setProperty('--my', `${y * 100}%`);
        el.style.setProperty('--spot', '1');
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--spot', '0');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, []);
  return ref;
}

/** The example campaign's app icon, with a gloss that sweeps across it now and then. */
function AppIcon() {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[13px] shadow-[0_10px_24px_-10px_rgb(255_170_40/0.85)] ring-1 ring-black/5">
      {/* eslint-disable-next-line @next/next/no-img-element -- 7 KB local webp, no optimisation needed */}
      <img src="/site/app-icon.webp" alt="" width={44} height={44} className="h-full w-full object-cover" />
      <span className="pointer-events-none absolute inset-0 rounded-[13px] ring-1 ring-inset ring-white/25" />
      <span className="hero-motion pointer-events-none absolute inset-y-0 left-0 w-2/3 animate-[gloss_5s_ease-in-out_1.2s_infinite] bg-gradient-to-r from-transparent via-white/45 to-transparent" />
    </div>
  );
}

/**
 * Illustrative product preview for the hero: a campaign card with live-looking numbers, an
 * animated chart and a feed of verified events that slides smoothly as new ones arrive.
 */
export function HeroMockup({ t }: { t: SiteDict['mockup'] }) {
  // Starting figures, prices and countries come from the (admin-editable) copy.
  const prices = t.prices.map((p) => Number(p.replace(',', '.')) || 0);
  const countries = t.countries.length ? t.countries : ['TR'];
  const tilt = useTilt();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 2600);
    return () => clearInterval(id);
  }, []);

  // One more row than visible: the oldest one fades out below while the newest slides in on top.
  const feed = Array.from({ length: VISIBLE + 1 }, (_, i) => {
    const n = tick - i;
    const m = ((n % 1000) + 1000) % 1000;
    return { key: n, index: i, label: t.events[m % t.events.length]!, country: countries[m % countries.length]!, price: prices[m % prices.length] ?? 0, filtered: m % 7 === 3 };
  });
  const newest = feed[0]!;

  const billed = Array.from({ length: tick }, (_, i) => (i % 7 === 3 ? 0 : (prices[i % prices.length] ?? 0))).reduce((a, b) => a + b, 0);
  const spend = useTween(num(t.spendValue) + billed);
  const installs = useTween(num(t.installsValue) + Math.floor(tick * 0.6));
  const rate = useTween(num(t.roasValue) + Math.min(tick, 30) * 0.02);

  const kpis = [
    { label: t.spend, value: `$${Math.round(spend).toLocaleString('en-US')}`, delta: t.spendDelta, bubble: true },
    { label: t.installs, value: Math.round(installs).toLocaleString('en-US'), delta: t.installsDelta, bubble: false },
    { label: t.roas, value: `${rate.toFixed(1)}%`, delta: t.roasDelta, bubble: false },
  ];

  return (
    <div className="hero-card relative animate-float font-card">
      <div className="absolute -inset-20 -z-10 animate-aurora bg-[radial-gradient(closest-side_at_35%_35%,rgb(108_87_240/0.5),transparent),radial-gradient(closest-side_at_70%_65%,rgb(255_107_44/0.3),transparent),radial-gradient(closest-side_at_40%_80%,rgb(52_211_153/0.18),transparent)] opacity-80" />
      <div
        ref={tilt}
        className="mockup-border relative rounded-[1.35rem] p-px transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [transform:perspective(1100px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]"
      >
        <div className="relative overflow-hidden rounded-[calc(1.35rem-1px)] bg-elevated shadow-[0_40px_120px_-30px_var(--mockup-shadow)]">
          {/* Spotlight that follows the mouse. */}
          <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,0%),rgb(140_123_255/0.12),transparent_60%)] opacity-[var(--spot,0)] transition-opacity duration-500" />

          <div className="flex items-center gap-3.5 border-b border-line bg-gradient-to-b from-surface-strong/70 to-transparent px-5 py-4">
            <AppIcon />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.95rem] font-bold tracking-[-0.01em]">{t.title}</div>
              <div className="mt-0.5 text-xs font-medium text-subtle">{t.platforms}</div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-good/25 bg-good/10 px-2.5 py-1 text-[0.7rem] font-semibold text-good">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-good/70" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-good" />
              </span>
              {t.live}
            </span>
          </div>

          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            {kpis.map((k) => (
              <div key={k.label} className="relative min-w-0 px-3 py-3.5 transition-colors sm:px-5 sm:py-4 duration-500 hover:bg-surface-strong/60">
                <div className="truncate text-[0.72rem] font-medium text-subtle">{k.label}</div>
                <div className="mt-1.5 font-figure text-[1.1rem] leading-none sm:text-[1.35rem] font-semibold tracking-[-0.03em] tabular-nums">{k.value}</div>
                <div className="mt-2 inline-flex items-center gap-0.5 rounded-full bg-good/10 px-1.5 py-0.5 text-[0.66rem] font-semibold text-good">
                  <ArrowUpRight size={11} strokeWidth={2.6} />
                  {k.delta.replace(/^\+/, '')}
                </div>
                {k.bubble && tick > 0 && !newest.filtered && (
                  <span key={tick} className="hero-motion pointer-events-none absolute right-2 bottom-3.5 animate-[bubble-up_1.8s_cubic-bezier(0.22,1,0.36,1)_both] rounded-full bg-good px-1.5 py-0.5 font-figure text-[0.62rem] font-semibold text-white shadow-[0_6px_16px_-6px_var(--good)]">
                    +${newest.price.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="relative px-5 pt-4">
            <svg viewBox="0 0 400 110" className="h-28 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8c7bff" stopOpacity="0.45" />
                  <stop offset="1" stopColor="#8c7bff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#8c7bff" />
                  <stop offset="1" stopColor="#ff8a4c" />
                </linearGradient>
              </defs>
              {[30, 60, 90].map((y) => (
                <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
              ))}
              <path className="animate-area-in" d="M0 88 C40 80 60 84 90 70 S150 64 180 52 S240 58 270 40 S330 30 360 22 S390 16 400 12 V110 H0Z" fill="url(#hero-area)" />
              <path
                className="animate-draw"
                pathLength={1}
                d="M0 88 C40 80 60 84 90 70 S150 64 180 52 S240 58 270 40 S330 30 360 22 S390 16 400 12"
                fill="none"
                stroke="url(#hero-line)"
                strokeWidth="2.75"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* A short light that keeps running along the line. */}
              <path
                className="hero-motion animate-[comet_3.4s_cubic-bezier(0.45,0,0.25,1)_2.6s_infinite_both]"
                pathLength={1}
                d="M0 88 C40 80 60 84 90 70 S150 64 180 52 S240 58 270 40 S330 30 360 22 S390 16 400 12"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.9"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="0.1 1.2"
                vectorEffect="non-scaling-stroke"
                style={{ filter: 'drop-shadow(0 0 4px rgb(255 138 76 / 0.9))' }}
              />
            </svg>
            {/* Pulsing "now" marker at the end of the line. */}
            <span className="absolute top-[1.55rem] right-5 h-2.5 w-2.5 translate-x-1/2 rounded-full bg-orange-400 shadow-[0_0_0_4px_rgb(255_138_76/0.25),0_0_18px_rgb(255_138_76/0.9)]">
              <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/70" />
            </span>
          </div>

          <div className="px-5 pb-5">
            <div className="mb-2.5 flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-subtle">
              {t.feedTitle}
              <ShieldCheck size={13} className="text-good" />
            </div>
            <ul className="relative overflow-hidden" style={{ height: ROW * VISIBLE - 6 }}>
              {feed.map((e) => (
                <li
                  key={e.key}
                  className={`absolute inset-x-0 flex h-10 items-center justify-between overflow-hidden rounded-2xl border px-3 text-[0.84rem] font-medium transition-[transform,opacity,background-color,border-color,box-shadow] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    e.index === 0 ? 'animate-feed-in border-violet-400/40 bg-violet-500/[0.1] shadow-[0_10px_28px_-14px_rgb(108_87_240/0.9)]' : 'border-line bg-surface'
                  }`}
                  style={{ transform: `translateY(${e.index * ROW}px) scale(${e.index >= VISIBLE ? 0.96 : 1})`, opacity: e.index >= VISIBLE ? 0 : 1 }}
                >
                  {e.index === 0 && (
                    <span className="hero-motion pointer-events-none absolute inset-0 animate-[row-shine_1.4s_cubic-bezier(0.22,1,0.36,1)_0.25s_both] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  )}
                  <span className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-surface-strong px-1.5 py-0.5 font-figure text-[0.6rem] font-semibold tracking-wider text-muted">{e.country}</span>
                    <span className={e.filtered ? 'text-subtle line-through' : ''}>{e.label}</span>
                  </span>
                  {e.filtered ? (
                    <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-warn">
                      <ShieldCheck size={13} /> {t.filtered}
                    </span>
                  ) : (
                    <span
                      className={`font-figure text-[0.8rem] font-semibold text-good tabular-nums ${e.index === 0 ? 'hero-motion animate-[pop_0.6s_cubic-bezier(0.22,1,0.36,1)_0.15s_both]' : ''}`}
                    >
                      ${e.price.toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { SiteDict } from '@/lib/i18n';

const COUNTRIES = ['FI', 'DE', 'TR', 'SE', 'DE', 'TR', 'NO'];
const PRICES = [0.6, 3, 6, 0.6, 5.5];
/** Row height + gap of the event feed (px); rows slide by exactly this much. */
const ROW = 44;
const VISIBLE = 4;

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

/** Stylised game icon for the example campaign (an original mark, not a real game's logo). */
function AppIcon() {
  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] shadow-[0_6px_18px_-6px_rgb(255_107_44/0.7)] ring-1 ring-white/15">
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="ic-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff9a4d" />
            <stop offset="0.55" stopColor="#e2456b" />
            <stop offset="1" stopColor="#6c57f0" />
          </linearGradient>
          <linearGradient id="ic-wing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffe3c7" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" fill="url(#ic-bg)" />
        <circle cx="48" cy="14" r="18" fill="#fff" opacity="0.12" />
        {/* Dragon: head, wing and tail in one silhouette. */}
        <path
          d="M14 44c6-2 9-7 10-13 3 3 7 4 11 3-2-4-1-9 3-12 1 4 4 6 8 6l-3 4c3 1 5 3 6 6-4-1-7 0-9 2 1 4-1 8-5 10 0-3-1-5-4-6-3 3-8 4-13 3 2-1 3-2 3-4-3 1-5 1-7 1z"
          fill="url(#ic-wing)"
        />
        <circle cx="41.5" cy="25.5" r="1.4" fill="#6c57f0" />
        <rect width="64" height="32" fill="#fff" opacity="0.08" />
      </svg>
    </div>
  );
}

/**
 * Illustrative product preview for the hero: a campaign card with live-looking numbers, an
 * animated chart and a feed of verified events that slides smoothly as new ones arrive.
 */
export function HeroMockup({ t }: { t: SiteDict['mockup'] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 2600);
    return () => clearInterval(id);
  }, []);

  // One more row than visible: the oldest one fades out below while the newest slides in on top.
  const feed = Array.from({ length: VISIBLE + 1 }, (_, i) => {
    const n = tick - i;
    const m = ((n % 1000) + 1000) % 1000;
    return { key: n, index: i, label: t.events[m % t.events.length]!, country: COUNTRIES[m % COUNTRIES.length]!, price: PRICES[m % PRICES.length]!, filtered: m % 7 === 3 };
  });

  const billed = Array.from({ length: tick }, (_, i) => (i % 7 === 3 ? 0 : PRICES[i % PRICES.length]!)).reduce((a, b) => a + b, 0);
  const spend = useTween(4812 + billed);
  const installs = useTween(7346 + Math.floor(tick * 0.6));
  const rate = useTween(41.6 + Math.min(tick, 30) * 0.02);

  const kpis = [
    { label: t.spend, value: `$${Math.round(spend).toLocaleString('en-US')}`, delta: '+18%' },
    { label: t.installs, value: Math.round(installs).toLocaleString('en-US'), delta: '+22%' },
    { label: t.roas, value: `${rate.toFixed(1)}%`, delta: '+3.1pt' },
  ];

  return (
    <div className="relative animate-float">
      <div className="absolute -inset-10 -z-10 animate-aurora rounded-[3rem] bg-[conic-gradient(from_180deg,rgb(108_87_240/0.45),rgb(255_107_44/0.28),rgb(52_211_153/0.18),rgb(108_87_240/0.45))] opacity-70 blur-3xl" />
      <div className="mockup-border relative rounded-2xl p-px">
        <div className="glass relative overflow-hidden rounded-[calc(1rem-1px)] !border-0 bg-elevated/80 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.8)]">
          <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <AppIcon />
            <span className="text-sm font-semibold">{t.title}</span>
          </div>

          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            {kpis.map((k) => (
              <div key={k.label} className="group px-5 py-4 transition-colors duration-500 hover:bg-white/[0.03]">
                <div className="text-[0.7rem] text-subtle">{k.label}</div>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{k.value}</div>
                <div className="text-[0.7rem] font-medium text-good">{k.delta}</div>
              </div>
            ))}
          </div>

          <div className="relative px-5 pt-4">
            <svg viewBox="0 0 400 110" className="h-28 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8c7bff" stopOpacity="0.5" />
                  <stop offset="1" stopColor="#8c7bff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#8c7bff" />
                  <stop offset="1" stopColor="#ff8a4c" />
                </linearGradient>
              </defs>
              <path className="animate-area-in" d="M0 88 C40 80 60 84 90 70 S150 64 180 52 S240 58 270 40 S330 30 360 22 S390 16 400 12 V110 H0Z" fill="url(#hero-area)" />
              <path
                className="animate-draw"
                pathLength={1}
                d="M0 88 C40 80 60 84 90 70 S150 64 180 52 S240 58 270 40 S330 30 360 22 S390 16 400 12"
                fill="none"
                stroke="url(#hero-line)"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Pulsing "now" marker at the end of the line. */}
            <span className="absolute top-[1.55rem] right-5 h-2.5 w-2.5 translate-x-1/2 rounded-full bg-orange-400 shadow-[0_0_0_4px_rgb(255_138_76/0.25),0_0_18px_rgb(255_138_76/0.9)]">
              <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/70" />
            </span>
          </div>

          <div className="px-5 pb-5">
            <div className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-subtle">{t.feedTitle}</div>
            <ul className="relative overflow-hidden" style={{ height: ROW * VISIBLE - 6 }}>
              {feed.map((e) => (
                <li
                  key={e.key}
                  className={`absolute inset-x-0 flex h-[38px] items-center justify-between rounded-xl border px-3 text-sm transition-[transform,opacity,background-color,border-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    e.index === 0 ? 'animate-feed-in border-violet-400/40 bg-violet-500/[0.12] shadow-[0_8px_24px_-12px_rgb(108_87_240/0.8)]' : 'border-line bg-surface'
                  }`}
                  style={{ transform: `translateY(${e.index * ROW}px)`, opacity: e.index >= VISIBLE ? 0 : 1 }}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold tracking-wide text-muted">{e.country}</span>
                    <span className={e.filtered ? 'text-subtle line-through' : ''}>{e.label}</span>
                  </span>
                  {e.filtered ? (
                    <span className="flex items-center gap-1 text-[0.7rem] font-medium text-warn">
                      <ShieldCheck size={13} /> {t.filtered}
                    </span>
                  ) : (
                    <span className="font-mono text-xs font-semibold text-good tabular-nums">${e.price.toFixed(2)}</span>
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

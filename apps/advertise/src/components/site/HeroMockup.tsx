'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { SiteDict } from '@/lib/i18n';

const FLAGS = ['🇫🇮', '🇩🇪', '🇹🇷', '🇸🇪', '🇩🇪', '🇹🇷'];
const PRICES = ['$0.60', '$3.00', '$6.00', '$0.60', '$5.50'];

/**
 * Illustrative product preview for the hero: a campaign card with a chart and a feed of
 * verified events. The numbers are an example (labelled as such), not live data.
 */
export function HeroMockup({ t }: { t: SiteDict['mockup'] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(id);
  }, []);

  const feed = Array.from({ length: 4 }, (_, i) => {
    const n = tick + i;
    return { key: n, label: t.events[n % t.events.length]!, flag: FLAGS[n % FLAGS.length]!, price: PRICES[n % PRICES.length]!, filtered: n % 7 === 3 };
  }).reverse();

  return (
    <div className="relative animate-float">
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(closest-side,rgb(108_87_240/0.35),transparent)] blur-2xl" />
      <div className="glass overflow-hidden rounded-2xl shadow-[0_40px_120px_-30px_rgb(0_0_0/0.8)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-violet-500 text-[0.7rem] font-bold text-white">DR</div>
            <span className="text-sm font-semibold">{t.title}</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-surface-strong px-2.5 py-1 text-[0.7rem] font-medium text-muted">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-good" />
            {t.live}
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
          {[
            { label: t.spend, value: '$4,812', delta: '+18%' },
            { label: t.installs, value: '7,346', delta: '+22%' },
            { label: t.roas, value: '41.6%', delta: '+3.1pt' },
          ].map((k) => (
            <div key={k.label} className="px-5 py-4">
              <div className="text-[0.7rem] text-subtle">{k.label}</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{k.value}</div>
              <div className="text-[0.7rem] font-medium text-good">{k.delta}</div>
            </div>
          ))}
        </div>

        <div className="px-5 pt-4">
          <svg viewBox="0 0 400 110" className="h-28 w-full" preserveAspectRatio="none" aria-hidden="true">
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
            <path d="M0 88 C40 80 60 84 90 70 S150 64 180 52 S240 58 270 40 S330 30 360 22 S390 16 400 12 V110 H0Z" fill="url(#hero-area)" />
            <path d="M0 88 C40 80 60 84 90 70 S150 64 180 52 S240 58 270 40 S330 30 360 22 S390 16 400 12" fill="none" stroke="url(#hero-line)" strokeWidth="2.5" />
          </svg>
        </div>

        <div className="px-5 pb-5">
          <div className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-subtle">{t.feedTitle}</div>
          <ul className="space-y-1.5">
            {feed.map((e, i) => (
              <li
                key={e.key}
                className={`flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm ${i === 0 ? 'animate-fade-up bg-surface-strong' : 'bg-surface'}`}
              >
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true">{e.flag}</span>
                  <span className={e.filtered ? 'text-subtle line-through' : ''}>{e.label}</span>
                </span>
                {e.filtered ? (
                  <span className="flex items-center gap-1 text-[0.7rem] font-medium text-warn">
                    <ShieldCheck size={13} /> {t.filtered}
                  </span>
                ) : (
                  <span className="font-mono text-xs font-semibold text-good tabular-nums">{e.price}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

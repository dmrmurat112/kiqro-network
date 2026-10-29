'use client';

import { useMemo, useState } from 'react';

export interface TrendPoint {
  label: string; // formatted date
  spend: number; // USD
  installs: number;
  events: number;
}

interface Props {
  points: TrendPoint[];
  labels: { spend: string; installs: string; events: string };
  locale: string;
}

const W = 720;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };

/** Spend as a smooth area (left scale) with installs as bars (right scale); hover for values. */
export function TrendChart({ points, labels, locale }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const money = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }), [locale]);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxSpend = Math.max(...points.map((p) => p.spend), 1);
  const maxInstalls = Math.max(...points.map((p) => p.installs), 1);
  const step = innerW / Math.max(points.length - 1, 1);
  const x = (i: number) => PAD.left + i * step;
  const ySpend = (v: number) => PAD.top + innerH - (v / maxSpend) * innerH * 0.92;
  const barW = Math.max(Math.min(step * 0.45, 16), 2);

  // Monotone-ish smoothing with horizontal control points.
  const line = points
    .map((p, i) => {
      if (i === 0) return `M${x(0)},${ySpend(p.spend)}`;
      const px = x(i - 1);
      const cx = (px + x(i)) / 2;
      return `C${cx},${ySpend(points[i - 1]!.spend)} ${cx},${ySpend(p.spend)} ${x(i)},${ySpend(p.spend)}`;
    })
    .join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const tickEvery = Math.ceil(points.length / 7);
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-64 w-full touch-none select-none"
        preserveAspectRatio="none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round((rel - PAD.left) / step))));
        }}
        role="img"
        aria-label={`${labels.spend} / ${labels.installs}`}
      >
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8c7bff" stopOpacity="0.38" />
            <stop offset="1" stopColor="#8c7bff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="trend-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8c7bff" />
            <stop offset="1" stopColor="#b3a8ff" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * (1 - f * 0.92)} y2={PAD.top + innerH * (1 - f * 0.92)} stroke="var(--line)" strokeDasharray="3 5" />
        ))}
        {points.map((p, i) => {
          const h = (p.installs / maxInstalls) * innerH * 0.55;
          return (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={PAD.top + innerH - h}
              width={barW}
              height={h}
              rx={Math.min(3, barW / 2)}
              fill="#ff8a4c"
              opacity={hover === null || hover === i ? 0.75 : 0.3}
            />
          );
        })}
        <path d={area} fill="url(#trend-area)" />
        <path d={line} fill="none" stroke="url(#trend-line)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={ySpend(points[hover]!.spend)} r={5} fill="#8c7bff" stroke="var(--bg)" strokeWidth={2.5} />
          </>
        )}
        {points.map((p, i) =>
          i % tickEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--fg-subtle)">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 -translate-x-1/2 rounded-xl border border-line-strong bg-elevated/95 px-3.5 py-2.5 text-xs shadow-xl backdrop-blur"
          style={{ left: `${Math.min(Math.max((x(hover) / W) * 100, 14), 86)}%` }}
        >
          <div className="mb-1.5 font-semibold text-fg">{active.label}</div>
          <div className="flex justify-between gap-4 text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" />{labels.spend}</span>
            <span className="font-mono text-fg">{money.format(active.spend)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-4 text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-400" />{labels.installs}</span>
            <span className="font-mono text-fg">{active.installs}</span>
          </div>
          <div className="mt-1 flex justify-between gap-4 text-muted">
            <span>{labels.events}</span>
            <span className="font-mono text-fg">{active.events}</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />{labels.spend}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-400/80" />{labels.installs}</span>
      </div>
    </div>
  );
}

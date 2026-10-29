import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>;
}

/** Segmented control made of links (keeps state in the URL, works without JS). */
export function Segmented({ options, value }: { options: { href: string; label: string; value: string }[]; value: string }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${o.value === value ? 'bg-violet-500 text-white shadow-sm' : 'text-muted hover:text-fg'}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function Delta({ value, label, invert = false }: { value: number | null; label: string; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-subtle">—</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={label}>
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold ${good ? 'bg-good/12 text-good' : 'bg-bad/12 text-bad'}`}>
        <Icon size={12} strokeWidth={2.5} />
        {Math.abs(value).toFixed(value !== 0 && Math.abs(value) < 10 ? 1 : 0)}%
      </span>
      <span className="text-subtle">{label}</span>
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-good/12 text-good',
  billed: 'bg-good/12 text-good',
  paused: 'bg-warn/12 text-warn',
  in_review: 'bg-warn/12 text-warn',
  draft: 'bg-surface-strong text-muted',
  completed: 'bg-surface-strong text-muted',
  not_billed: 'bg-surface-strong text-muted',
  refunded: 'bg-violet-500/15 text-violet-300',
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-surface-strong text-muted'}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid place-items-center px-6 py-16 text-center text-sm text-muted">{children}</div>;
}

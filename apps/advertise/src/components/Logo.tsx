/** Kiqro K-mark (redrawn from the brand logo) with the wordmark and a "network" tag. */
export function KMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    // Solid brand fill, no gradient: the logo is rendered several times per page (some copies
    // inside hidden containers), and a shared gradient id would then fail to paint.
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true">
      <path
        fill="#6c57f0"
        d="M0 0h38v12c0 18-4 28-12 31-6 2-14 4-22 5 8 1 16 3 22 5 8 3 12 13 12 31v16H0z M44 21 68 0h52L66 45c-12 1-20-6-22-16z M44 79c2-10 10-17 22-16l54 37H68z"
      />
    </svg>
  );
}

export function Logo({ tag = 'network' }: { tag?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <KMark />
      <span className="text-[1.35rem] font-bold tracking-tight text-fg">kiqro</span>
      {tag && (
        <span className="rounded-md border border-line-strong px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted">{tag}</span>
      )}
    </span>
  );
}

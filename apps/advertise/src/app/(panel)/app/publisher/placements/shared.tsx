import { Apple, Code2, Globe, Smartphone } from 'lucide-react';

export const TYPES = ['android', 'ios', 'web', 'api'] as const;
export type PlacementType = (typeof TYPES)[number];

export function TypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  if (type === 'ios') return <Apple size={size} />;
  if (type === 'web') return <Globe size={size} />;
  if (type === 'api') return <Code2 size={size} />;
  return <Smartphone size={size} />;
}

/** Store icon of the placement's app, or a gradient tile with its type glyph. */
export function PlacementIcon({ type, iconUrl, size = 44 }: { type: string; iconUrl: string | null; size?: number }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote store icon
    return <img src={iconUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-xl border border-line object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/80 to-fuchsia-500/70 text-white" style={{ width: size, height: size }}>
      <TypeIcon type={type} size={Math.round(size * 0.45)} />
    </span>
  );
}

export function TypeBadge({ type, label }: { type: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-strong px-1.5 py-0.5 text-[0.7rem] font-medium text-muted">
      <TypeIcon type={type} size={11} /> {label}
    </span>
  );
}

/** Short form of a store page or website for lists: package name, App Store id or host. */
export function storeLabel(url: string | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname === 'play.google.com') return u.searchParams.get('id') ?? u.hostname;
    const apple = /\/id(\d+)/.exec(u.pathname);
    if (u.hostname === 'apps.apple.com' && apple) return `id${apple[1]}`;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * App details (name, icon, developer) from Google Play and the App Store, so advertisers can
 * paste a store link or ID instead of typing everything. Only the two fixed store hosts are
 * ever requested, with IDs validated first, so user input cannot point requests elsewhere.
 */

export type StorePlatform = 'android' | 'ios';

export interface StoreRef {
  platform: StorePlatform;
  /** Play package name, or the numeric App Store ID (bundle IDs are resolved by the lookup). */
  storeId: string;
  /** For iOS input given as a bundle ID ("com.studio.game"). */
  bundleId?: string;
}

export interface StoreApp {
  platform: StorePlatform | 'web';
  storeId: string;
  name: string;
  iconUrl: string;
  developer: string | null;
  /** Up to 8 store screenshots (https), when the store lists them. */
  screenshots?: string[];
}

type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z_][\w]*)+$/;

/**
 * Understands what advertisers paste: Play or App Store links, "id123…", a numeric ID or a
 * package / bundle name. The platform hint decides how a bare package name is read.
 */
export function parseStoreInput(raw: string, platformHint: string): StoreRef | null {
  const input = raw.trim();
  if (!input) return null;

  const play = /play\.google\.com\/store\/apps\/details\?(?:.*&)?id=([\w.]+)/i.exec(input);
  if (play && PACKAGE.test(play[1]!)) return { platform: 'android', storeId: play[1]! };

  const apple = /apps\.apple\.com\/.*\/id(\d{5,12})/i.exec(input) ?? /^(?:id)?(\d{5,12})$/i.exec(input);
  if (apple) return { platform: 'ios', storeId: apple[1]! };

  if (PACKAGE.test(input)) {
    return platformHint === 'ios' ? { platform: 'ios', storeId: input, bundleId: input } : { platform: 'android', storeId: input };
  }
  return null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const meta = (html: string, property: string) => {
  const m = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i').exec(html) ?? new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, 'i').exec(html);
  return m ? decode(m[1]!) : null;
};

async function getText(fetcher: Fetcher, url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetcher(url, { headers: { 'accept-language': 'en-US,en;q=0.8', 'user-agent': 'Mozilla/5.0 (compatible; KiqroNetwork/1.0)' }, signal: controller.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Screenshot URLs from a Play store page (images Play marks as screenshots), resized to
 * a 720px height. Best effort: an empty list when Play changes its markup.
 */
function playScreenshots(html: string): string[] {
  const out = new Set<string>();
  for (const tag of html.match(/<img[^>]+>/g) ?? []) {
    if (!/alt="Screenshot image"/i.test(tag)) continue;
    const src = /src="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)/.exec(tag)?.[1];
    if (src) out.add(`${src}=h720`);
    if (out.size >= 8) break;
  }
  return [...out];
}

async function lookupPlay(fetcher: Fetcher, pkg: string): Promise<StoreApp | null> {
  const html = await getText(fetcher, `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=en&gl=US`);
  if (!html) return null;
  const title = meta(html, 'og:title');
  const image = meta(html, 'og:image');
  if (!title || !image) return null;
  const developer = /<a[^>]+href="\/store\/apps\/dev(?:eloper)?\?id=[^"]+"[^>]*>(?:<span[^>]*>)?([^<]+)</i.exec(html)?.[1];
  return {
    platform: 'android',
    storeId: pkg,
    name: title.replace(/\s+-\s+Apps on Google Play$/i, '').trim(),
    // Play serves the icon at any size via the "=sNNN" suffix.
    iconUrl: image.replace(/=[swh]\d+.*$/, '') + '=s256',
    developer: developer ? decode(developer).trim() : null,
    screenshots: playScreenshots(html),
  };
}

async function lookupAppStore(fetcher: Fetcher, ref: StoreRef): Promise<StoreApp | null> {
  const query = ref.bundleId ? `bundleId=${encodeURIComponent(ref.bundleId)}` : `id=${ref.storeId}`;
  const body = await getText(fetcher, `https://itunes.apple.com/lookup?${query}&country=us&entity=software`);
  if (!body) return null;
  try {
    const app = (JSON.parse(body) as { results?: { trackId?: number; trackName?: string; artworkUrl512?: string; artworkUrl100?: string; sellerName?: string; artistName?: string; screenshotUrls?: string[] }[] }).results?.[0];
    if (!app?.trackId || !app.trackName) return null;
    return {
      platform: 'ios',
      storeId: String(app.trackId),
      name: app.trackName,
      iconUrl: app.artworkUrl512 ?? app.artworkUrl100 ?? '',
      developer: app.sellerName ?? app.artistName ?? null,
      screenshots: (app.screenshotUrls ?? []).filter((u) => u.startsWith('https://')).slice(0, 8),
    };
  } catch {
    return null;
  }
}

const CACHE_MS = 6 * 3_600_000;
const MISS_CACHE_MS = 10 * 60_000; // a miss may be a store hiccup: retry sooner
const cache = new Map<string, { at: number; app: StoreApp | null }>();

/** Looks an app up in its store. Hits are cached for 6 hours, misses for 10 minutes. */
export async function lookupStoreApp(ref: StoreRef, fetcher: Fetcher = fetch as unknown as Fetcher, now = Date.now()): Promise<StoreApp | null> {
  const key = `${ref.platform}:${ref.bundleId ?? ref.storeId}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.app ? CACHE_MS : MISS_CACHE_MS)) return hit.app;
  const app = ref.platform === 'android' ? await lookupPlay(fetcher, ref.storeId) : await lookupAppStore(fetcher, ref);
  if (cache.size > 2_000) cache.clear();
  cache.set(key, { at: now, app });
  return app;
}

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * A website "app": the domain from what the advertiser typed, with its favicon from Google's
 * favicon service. Nothing is fetched from the advertiser's host itself (no server-side
 * requests to arbitrary addresses).
 */
export function websiteApp(raw: string): StoreApp | null {
  let host = raw.trim().toLowerCase();
  try {
    host = new URL(/^https?:\/\//.test(host) ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  if (!HOSTNAME.test(host)) return null;
  return { platform: 'web', storeId: host, name: host, iconUrl: `https://www.google.com/s2/favicons?domain=${host}&sz=128`, developer: null };
}

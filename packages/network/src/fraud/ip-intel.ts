import type { IpRisk } from '@kiqro/db/schema';

/** Looks up an IP address. Returns null when the provider is unavailable; callers fail open. */
export interface IpIntel {
  lookup(ip: string): Promise<IpRisk | null>;
}

/** No provider configured (local development, tests): no IP verdicts. */
export const noIpIntel: IpIntel = { lookup: async () => null };

/** Fixed verdicts per IP, for tests and local experiments. */
export function staticIpIntel(verdicts: Record<string, Partial<IpRisk>>): IpIntel {
  return {
    lookup: async (ip) => {
      const v = verdicts[ip];
      return v ? { source: 'static', country: null, vpn: false, proxy: false, tor: false, datacenter: false, score: 0, ...v } : null;
    },
  };
}

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** One address in a proxycheck.io v3 response (https://proxycheck.io/api/, OpenAPI 3.1.0). */
interface ProxycheckResult {
  risk?: number;
  detections?: { proxy?: boolean; vpn?: boolean; tor?: boolean; hosting?: boolean; compromised?: boolean; anonymous?: boolean };
  location?: { isocode?: string | null };
  network?: { type?: string | null };
}

/**
 * proxycheck.io v3 VPN/proxy detection. The result for an address sits under that address as
 * key; `status` is ok or warning (near the plan's limit) on success, denied or error otherwise.
 * Results are cached in memory as proxycheck.io recommends (clean addresses up to 1 h,
 * detected ones 15 min, since a detection can be delisted) because one user clicks many offers
 * from the same IP and every lookup counts against the plan.
 */
export function proxycheckIntel(
  apiKey: string,
  opts: { fetcher?: Fetcher; timeoutMs?: number; cleanTtlMs?: number; detectedTtlMs?: number; maxCacheSize?: number; warn?: (message: string) => void } = {},
): IpIntel {
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  const timeoutMs = opts.timeoutMs ?? 1500;
  const cleanTtl = opts.cleanTtlMs ?? 3_600_000;
  const detectedTtl = opts.detectedTtlMs ?? 15 * 60_000;
  const maxSize = opts.maxCacheSize ?? 50_000;
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const cache = new Map<string, { until: number; value: IpRisk }>();
  let lastWarning = 0;
  // Quota or key problems are logged at most every 10 minutes so they are noticed without flooding logs.
  const report = (message: string) => {
    if (Date.now() - lastWarning < 10 * 60_000) return;
    lastWarning = Date.now();
    warn(`proxycheck.io: ${message}`);
  };

  return {
    async lookup(ip) {
      const hit = cache.get(ip);
      if (hit && Date.now() < hit.until) return hit.value;

      let body: ({ status?: string; message?: string } & Record<string, unknown>) | null;
      try {
        const url = `https://proxycheck.io/v3/${encodeURIComponent(ip)}?key=${encodeURIComponent(apiKey)}&p=0`;
        const res = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
        body = (await res.json().catch(() => null)) as typeof body;
        if (!res.ok || (body?.status !== 'ok' && body?.status !== 'warning')) {
          report(`${body?.status ?? res.status} ${body?.message ?? ''}`.trim());
          return null; // fail open, not cached: the next click retries
        }
        if (body.status === 'warning' && body.message) report(body.message);
      } catch {
        // Timeout or network error: fail open, do not cache so the next click retries.
        return null;
      }

      const r = body[ip] as ProxycheckResult | undefined;
      if (!r || typeof r !== 'object') return null;
      const d = r.detections ?? {};
      const value: IpRisk = {
        source: 'proxycheck',
        country: r.location?.isocode && /^[A-Za-z]{2}$/.test(r.location.isocode) ? r.location.isocode.toUpperCase() : null,
        vpn: Boolean(d.vpn),
        proxy: Boolean(d.proxy || d.compromised),
        tor: Boolean(d.tor),
        datacenter: Boolean(d.hosting || r.network?.type === 'Hosting'),
        score: Math.max(0, Math.min(100, Math.round(r.risk ?? 0))),
      };

      if (cache.size >= maxSize) cache.delete(cache.keys().next().value!);
      const detected = value.vpn || value.proxy || value.tor || value.datacenter || d.anonymous;
      cache.set(ip, { until: Date.now() + (detected ? detectedTtl : cleanTtl), value });
      return value;
    },
  };
}

/** Builds the provider from the environment: PROXYCHECK_API_KEY enables proxycheck.io. */
export function ipIntelFromEnv(env: NodeJS.ProcessEnv = process.env): IpIntel {
  return env.PROXYCHECK_API_KEY ? proxycheckIntel(env.PROXYCHECK_API_KEY) : noIpIntel;
}

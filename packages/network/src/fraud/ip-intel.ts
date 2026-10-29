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

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

interface IpqsResponse {
  success?: boolean;
  fraud_score?: number;
  country_code?: string;
  vpn?: boolean;
  active_vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  active_tor?: boolean;
  connection_type?: string;
}

/**
 * IPQualityScore proxy/VPN detection API. Results are cached in memory (default 6 h) because
 * the API is billed per lookup and one user clicks many offers from the same IP.
 * Field names follow the IPQS JSON response; verify against their docs when upgrading.
 */
export function ipqsIntel(apiKey: string, opts: { fetcher?: Fetcher; timeoutMs?: number; cacheTtlMs?: number; maxCacheSize?: number } = {}): IpIntel {
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  const timeoutMs = opts.timeoutMs ?? 1500;
  const ttl = opts.cacheTtlMs ?? 6 * 3_600_000;
  const maxSize = opts.maxCacheSize ?? 50_000;
  const cache = new Map<string, { at: number; value: IpRisk | null }>();

  return {
    async lookup(ip) {
      const hit = cache.get(ip);
      if (hit && Date.now() - hit.at < ttl) return hit.value;

      let value: IpRisk | null = null;
      try {
        const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(apiKey)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`;
        const res = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
        const body = (res.ok ? await res.json() : null) as IpqsResponse | null;
        if (body?.success) {
          value = {
            source: 'ipqs',
            country: body.country_code && body.country_code !== 'N/A' ? body.country_code.toUpperCase() : null,
            vpn: Boolean(body.vpn || body.active_vpn),
            proxy: Boolean(body.proxy),
            tor: Boolean(body.tor || body.active_tor),
            datacenter: body.connection_type === 'Data Center',
            score: Math.max(0, Math.min(100, Math.round(body.fraud_score ?? 0))),
          };
        }
      } catch {
        // Timeout or network error: fail open, do not cache so the next click retries.
        return null;
      }

      if (cache.size >= maxSize) cache.delete(cache.keys().next().value!);
      cache.set(ip, { at: Date.now(), value });
      return value;
    },
  };
}

/** Builds the provider from the environment: IPQS_API_KEY enables IPQualityScore. */
export function ipIntelFromEnv(env: NodeJS.ProcessEnv = process.env): IpIntel {
  return env.IPQS_API_KEY ? ipqsIntel(env.IPQS_API_KEY) : noIpIntel;
}

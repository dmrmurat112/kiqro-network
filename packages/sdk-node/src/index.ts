/**
 * Kiqro Direct server SDK for publishers (Node.js 18+, no dependencies).
 * Runs on your backend only: it holds the placement secret.
 *
 *   const kiqro = new KiqroDirect({ appKey: process.env.KIQRO_APP_KEY, secret: process.env.KIQRO_SECRET });
 *   const offers = await kiqro.getOffers('u_102938', { lang: 'tr' });
 *   const url = kiqro.wallUrl('u_102938', { lang: 'tr' }); // open in a WebView
 *   if (kiqro.verifyPostback(req.query)) { … credit once per transaction_id + status … }
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface KiqroDirectOptions {
  appKey: string;
  secret: string;
  /** Defaults to production; use https://track-staging.kiqronetwork.com while testing. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Request timeout in milliseconds (default 5000). */
  timeoutMs?: number;
}

export interface OfferTask {
  taskId: string;
  seq: number;
  name: string;
  timeLimitDays: number;
  payoutUsd: string;
  rewardPoints: string;
  state: 'open' | 'credited' | 'in_review' | 'rejected' | 'reversed';
}

export interface Offer {
  offerId: string;
  title: string;
  description: string;
  platform: string;
  iconUrl: string | null;
  clickUrl: string;
  totalRewardPoints: string;
  started: boolean;
  completed: boolean;
  tasks: OfferTask[];
}

export interface UserOptions {
  /** Two-letter language; offers fall back to English. */
  lang?: string;
  /** Your own 0–100 fraud score for the user; signed, so the user cannot change it. */
  risk?: number;
  /** Two-letter country when you call from your server (Kiqro sees your server's IP). */
  country?: string;
}

export interface Claim {
  claim_id: string;
  offer_id: string;
  task_id: string;
  status: 'open' | 'approved' | 'rejected';
  note: string | null;
  created_at: string;
  decided_at: string | null;
}

export class KiqroError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Kiqro Direct: ${status} ${code}`);
  }
}

export class KiqroDirect {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly opts: KiqroDirectOptions) {
    if (!opts.appKey || !opts.secret) throw new Error('KiqroDirect: appKey and secret are required');
    this.baseUrl = (opts.baseUrl ?? 'https://track.kiqronetwork.com').replace(/\/$/, '');
    this.fetcher = opts.fetch ?? fetch;
  }

  /** HMAC-SHA256 (hex) of the parts joined with "|", the signature every Kiqro request uses. */
  sign(parts: (string | number)[]): string {
    return createHmac('sha256', this.opts.secret).update(parts.join('|')).digest('hex');
  }

  private userParams(userId: string, o: UserOptions): URLSearchParams {
    const parts: (string | number)[] = [this.opts.appKey, userId];
    if (o.risk !== undefined) {
      if (!Number.isInteger(o.risk) || o.risk < 0 || o.risk > 100) throw new Error('KiqroDirect: risk must be an integer 0–100');
      parts.push(o.risk);
    }
    const q = new URLSearchParams({ app_key: this.opts.appKey, user_id: userId, sig: this.sign(parts) });
    if (o.risk !== undefined) q.set('risk', String(o.risk));
    if (o.lang) q.set('lang', o.lang);
    if (o.country) q.set('country', o.country.toUpperCase());
    return q;
  }

  /** Signed link to the hosted offerwall for one user; open it in a WebView or browser. */
  wallUrl(userId: string, o: UserOptions = {}): string {
    return `${this.baseUrl}/wall?${this.userParams(userId, o)}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 5000);
    try {
      const res = await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      const body = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) throw new KiqroError(res.status, body.error ?? 'error');
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Offers for one user, started ones first. */
  async getOffers(userId: string, o: UserOptions = {}): Promise<Offer[]> {
    return (await this.request<{ offers: Offer[] }>(`/v1/offers?${this.userParams(userId, o)}`)).offers;
  }

  /**
   * Checks a reward postback (query parameters of the request Kiqro sent to your postback URL).
   * Signature: HMAC(secret, user_id|amount|transaction_id|status). Credit at most once per
   * transaction_id and status; status 1 = reward, 2 = reversal.
   */
  verifyPostback(query: Record<string, string | string[] | undefined>): boolean {
    const v = (k: string) => {
      const x = query[k];
      return Array.isArray(x) ? x[0] : x;
    };
    const [userId, amount, tx, status, signature] = [v('user_id'), v('amount'), v('transaction_id'), v('status'), v('signature')];
    if (!userId || !amount || !tx || !status || !signature) return false;
    const expected = Buffer.from(this.sign([userId, amount, tx, status]), 'hex');
    const given = Buffer.from(signature, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** Files a missing-reward claim for a step the user says they completed. */
  async fileClaim(input: { userId: string; offerId: string; taskId: string; note?: string }): Promise<{ claim_id: string; status: Claim['status'] }> {
    return this.request('/v1/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_key: this.opts.appKey,
        user_id: input.userId,
        offer_id: input.offerId,
        task_id: input.taskId,
        note: input.note,
        sig: this.sign([this.opts.appKey, input.userId, input.offerId, input.taskId]),
      }),
    });
  }

  /** The user's claims and their status. */
  async listClaims(userId: string): Promise<Claim[]> {
    const q = new URLSearchParams({ app_key: this.opts.appKey, user_id: userId, sig: this.sign([this.opts.appKey, userId]) });
    return (await this.request<{ claims: Claim[] }>(`/v1/claims?${q}`)).claims;
  }
}

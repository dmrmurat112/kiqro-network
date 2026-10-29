import { createHmac, timingSafeEqual } from 'node:crypto';

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface CheckoutRequest {
  paymentId: string;
  orgId: string;
  /** Whole cents. */
  amountCents: number;
  description: string;
  customerEmail: string;
  locale: 'en' | 'tr';
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/** The part of Stripe the panel needs. A fake implementation stands in during local development. */
export interface PaymentGateway {
  kind: 'stripe' | 'dev';
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
}

export class StripeError extends Error {}

/** Stripe's form encoding for nested parameters: line_items[0][price_data][currency]=usd. */
function formEncode(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/** Stripe Checkout through the REST API (no SDK, same approach as the SendGrid mailer). */
export function stripeGateway(opts: { secretKey: string; fetcher?: Fetcher }): PaymentGateway {
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  return {
    kind: 'stripe',
    async createCheckout(req) {
      const body = formEncode({
        mode: 'payment',
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': req.amountCents,
        'line_items[0][price_data][product_data][name]': req.description,
        client_reference_id: req.orgId,
        customer_email: req.customerEmail,
        locale: req.locale,
        'metadata[payment_id]': req.paymentId,
        'metadata[org_id]': req.orgId,
        'payment_intent_data[metadata][payment_id]': req.paymentId,
        'payment_intent_data[metadata][org_id]': req.orgId,
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
      });
      const res = await fetcher('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          // A retried request for the same payment returns the same session instead of a second one.
          'idempotency-key': req.paymentId,
        },
        body,
      });
      const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
      if (!res.ok || !json.id || !json.url) throw new StripeError(json.error?.message ?? `Stripe returned ${res.status}`);
      return { id: json.id, url: json.url };
    },
  };
}

/** Local development without Stripe keys: "checkout" is a page in the panel that settles the payment. */
export function devGateway(advertiseBaseUrl: string): PaymentGateway {
  return {
    kind: 'dev',
    async createCheckout(req) {
      const id = `cs_dev_${req.paymentId}`;
      return { id, url: `${advertiseBaseUrl.replace(/\/$/, '')}/app/billing/dev-checkout?session=${id}` };
    },
  };
}

/** Stripe when STRIPE_SECRET_KEY is set; the dev gateway outside production; otherwise none. */
export function paymentGatewayFromEnv(env: NodeJS.ProcessEnv = process.env): PaymentGateway | null {
  if (env.STRIPE_SECRET_KEY) return stripeGateway({ secretKey: env.STRIPE_SECRET_KEY });
  if (env.NODE_ENV !== 'production') return devGateway(env.ADVERTISE_BASE_URL ?? 'http://localhost:4200');
  return null;
}

/**
 * Verifies a Stripe webhook signature header ("t=…,v1=…"): HMAC-SHA256 of "t.payload" with the
 * endpoint secret, within a tolerance so captured requests cannot be replayed later.
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = new Date(), toleranceSeconds = 300): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=', 2) as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(timestamp) || Math.abs(now.getTime() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest();
  return parts
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const given = Buffer.from(v, 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

/** Builds a signature header the way Stripe does. For tests and the dev checkout page. */
export function signStripePayload(payload: string, secret: string, now = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
}

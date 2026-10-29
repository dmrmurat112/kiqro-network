import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Db } from '@kiqro/db';
import { defaultFraudContext, fileClaim, handleClick, handlePostback, listOffers, listUserClaims, reverseConversion, type FraudContext } from '@kiqro/network';

export interface ServerOptions {
  db: Db;
  trackingBaseUrl: string;
  fraud?: FraudContext;
  logger?: boolean;
  /**
   * When set, every request except /health must carry `X-Origin-Auth: <secret>`. Cloudflare adds
   * this header (Transform Rule), so traffic that bypasses Cloudflare — and could forge its
   * country and IP headers — is refused.
   */
  originSecret?: string;
}

type Query = Record<string, string | undefined>;

/** The visitor's IP: Cloudflare's CF-Connecting-IP (trusted only behind the origin check), else the socket/proxy IP. */
function clientIp(req: FastifyRequest): string {
  const value = req.headers['cf-connecting-ip'];
  return (Array.isArray(value) ? value[0] : value) ?? req.ip;
}

/**
 * Visitor country for clicks. In production the service sits behind Cloudflare, which sets
 * CF-IPCountry; a GeoIP lookup replaces this when traffic does not pass through Cloudflare.
 */
function requestCountry(req: FastifyRequest): string | null {
  const value = req.headers['cf-ipcountry'];
  const country = (Array.isArray(value) ? value[0] : value)?.toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
}

const CLICK_ERRORS: Record<'en' | 'tr', Record<string, string>> = {
  en: {
    anonymizer: 'Please turn off your VPN or proxy and try again.',
    datacenter_ip: 'Please turn off your VPN or proxy and try again.',
    ip_country_mismatch: 'Please turn off your VPN or proxy and try again.',
    country_not_targeted: 'This offer is not available in your country.',
    ip_click_velocity: 'Too many attempts from your network. Please try again later.',
    default: 'This offer is not available right now. Please go back and choose another one.',
  },
  tr: {
    anonymizer: 'Lütfen VPN veya proxy bağlantınızı kapatıp tekrar deneyin.',
    datacenter_ip: 'Lütfen VPN veya proxy bağlantınızı kapatıp tekrar deneyin.',
    ip_country_mismatch: 'Lütfen VPN veya proxy bağlantınızı kapatıp tekrar deneyin.',
    country_not_targeted: 'Bu teklif ülkenizde geçerli değil.',
    ip_click_velocity: 'Ağınızdan çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.',
    default: 'Bu teklif şu anda kullanılamıyor. Lütfen geri dönüp başka bir teklif seçin.',
  },
};

/** Minimal page for refused clicks. Fraud reasons are deliberately not spelled out. */
function clickErrorPage(reason: string, lang: 'en' | 'tr'): string {
  const text = CLICK_ERRORS[lang][reason] ?? CLICK_ERRORS[lang].default!;
  const title = lang === 'tr' ? 'Teklif açılamadı' : 'Offer unavailable';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a14;color:#f4f3ff;font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
main{max-width:340px;padding:28px;text-align:center}h1{font-size:20px;margin:0 0 10px}p{color:#a7a3c2;line-height:1.5;margin:0}b{color:#8c7bff}</style></head>
<body><main><div style="font-size:22px;font-weight:700;margin-bottom:22px"><b>K</b> kiqro</div><h1>${title}</h1><p>${text}</p></main></body></html>`;
}

export function buildServer(opts: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  const fraud = opts.fraud ?? defaultFraudContext;
  // HTML-form style bodies (S2S postbacks, claims); Fastify parses only JSON by default.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  if (opts.originSecret) {
    const expected = Buffer.from(opts.originSecret);
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/health') return;
      const given = Buffer.from(String(req.headers['x-origin-auth'] ?? ''));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return reply.code(403).send({ error: 'forbidden' });
    });
  }

  app.get('/health', async () => ({ ok: true }));

  app.get<{ Params: { campaignId: string }; Querystring: Query }>('/c/:campaignId', async (req, reply) => {
    const result = await handleClick(opts.db, {
      campaignId: req.params.campaignId,
      appKey: req.query.app_key ?? '',
      publisherUserId: req.query.uid ?? '',
      signature: req.query.sig,
      country: requestCountry(req),
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      query: req.query,
      publisherRisk: req.query.risk,
      fraud,
    });
    if (!result.ok) {
      // Users reach this URL in a browser: show a readable page; API clients still get JSON.
      if (req.headers.accept?.includes('text/html')) {
        const tr = /^tr\b|,\s*tr\b/i.test(req.headers['accept-language'] ?? '');
        return reply.code(result.status).type('text/html; charset=utf-8').send(clickErrorPage(result.reason, tr ? 'tr' : 'en'));
      }
      return reply.code(result.status).send({ error: result.reason });
    }
    return reply.redirect(result.redirectUrl, 302);
  });

  app.get<{ Querystring: Query }>('/v1/offers', async (req, reply) => {
    const country = req.query.country?.toUpperCase() ?? null;
    const result = await listOffers(opts.db, {
      appKey: req.query.app_key ?? '',
      publisherUserId: req.query.user_id ?? '',
      signature: req.query.sig,
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      lang: req.query.lang ?? 'en',
      trackingBaseUrl: opts.trackingBaseUrl,
      publisherRisk: req.query.risk,
    });
    if (!result.ok) return reply.code(result.status).send({ error: result.reason });
    return { offers: result.offers };
  });

  // Missing-credit claims, filed by the publisher for its user (form or JSON body).
  app.post<{ Body: Query | undefined }>('/v1/claims', async (req, reply) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await fileClaim(opts.db, {
      appKey: b.app_key ?? '',
      publisherUserId: b.user_id ?? '',
      campaignId: b.offer_id ?? '',
      taskId: b.task_id ?? '',
      note: b.note,
      signature: b.sig ?? '',
    });
    if (!result.ok) return reply.code(result.status).send({ error: result.reason });
    return { claim_id: result.claimId, status: result.status };
  });

  app.get<{ Querystring: Query }>('/v1/claims', async (req, reply) => {
    const list = await listUserClaims(opts.db, { appKey: req.query.app_key ?? '', publisherUserId: req.query.user_id ?? '', signature: req.query.sig ?? '' });
    if (!list) return reply.code(403).send({ error: 'invalid_signature' });
    return {
      claims: list.map((c) => ({
        claim_id: c.id,
        offer_id: c.campaignId,
        task_id: c.taskId,
        status: c.status,
        note: c.decisionNote,
        created_at: c.createdAt.toISOString(),
        decided_at: c.decidedAt?.toISOString() ?? null,
      })),
    };
  });

  // MMPs call this with GET; S2S integrations may POST a form or JSON body instead.
  const postback = async (req: FastifyRequest<{ Params: { key: string }; Querystring: Query; Body: Query | undefined }>) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    return handlePostback(opts.db, { advertiserKey: req.params.key, query: { ...body, ...req.query }, url: req.url, ip: clientIp(req), fraud });
  };
  app.route<{ Params: { key: string }; Querystring: Query; Body: Query | undefined }>({
    method: ['GET', 'POST'],
    url: '/v1/mmp/:key',
    handler: async (req, reply) => {
      const result = await postback(req);
      return reply.code(result.httpStatus).send({ outcome: result.outcome, conversion_id: result.conversionId, reasons: result.reasons });
    },
  });

  app.get<{ Params: { key: string }; Querystring: Query }>('/v1/mmp/:key/reversal', async (req, reply) => {
    const { click_id: clickId, event, reason } = req.query;
    if (!clickId || !event) return reply.code(400).send({ error: 'click_id and event are required' });
    const result = await reverseConversion(opts.db, { advertiserKey: req.params.key, clickId, eventName: event, reason: reason ?? 'mmp_rejected' });
    if (!result.ok) return reply.code(result.reason === 'unknown_advertiser' ? 403 : 409).send({ error: result.reason });
    return { outcome: 'reversed', conversion_id: result.conversionId };
  });

  return app;
}

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Db } from '@kiqro/db';
import { handleClick } from './clicks.ts';
import { handlePostback, reverseConversion } from './conversions.ts';
import { listOffers } from './offers.ts';

export interface ServerOptions {
  db: Db;
  trackingBaseUrl: string;
  logger?: boolean;
}

type Query = Record<string, string | undefined>;

/**
 * Visitor country for clicks. In production the service sits behind Cloudflare, which sets
 * CF-IPCountry; a GeoIP lookup replaces this when traffic does not pass through Cloudflare.
 */
function requestCountry(req: FastifyRequest): string | null {
  const value = req.headers['cf-ipcountry'];
  const country = (Array.isArray(value) ? value[0] : value)?.toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
}

export function buildServer(opts: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });

  app.get('/health', async () => ({ ok: true }));

  app.get<{ Params: { campaignId: string }; Querystring: Query }>('/c/:campaignId', async (req, reply) => {
    const result = await handleClick(opts.db, {
      campaignId: req.params.campaignId,
      appKey: req.query.app_key ?? '',
      publisherUserId: req.query.uid ?? '',
      signature: req.query.sig,
      country: requestCountry(req),
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      query: req.query,
    });
    if (!result.ok) return reply.code(result.status).send({ error: result.reason });
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
    });
    if (!result.ok) return reply.code(result.status).send({ error: result.reason });
    return { offers: result.offers };
  });

  // MMPs call this with GET; S2S integrations may POST a form or JSON body instead.
  const postback = async (req: FastifyRequest<{ Params: { key: string }; Querystring: Query; Body: Query | undefined }>) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    return handlePostback(opts.db, { advertiserKey: req.params.key, query: { ...body, ...req.query }, url: req.url, ip: req.ip });
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

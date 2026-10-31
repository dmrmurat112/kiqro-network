import type { FastifyInstance } from 'fastify';
import { verify } from '@kiqro/core';
import type { Db } from '@kiqro/db';
import { MAX_STATS_DAYS, banUser, placementDailyStats, unbanUser } from '@kiqro/network/publisher';

/**
 * Server-to-server endpoints for publishers, signed with the placement secret. Each request
 * signs a distinct prefix ("stats|", "ban|", "unban|") so the offerwall's per-user signature,
 * which users can see, never authorizes them.
 *
 *   GET  /v1/publisher/stats?app_key&from=YYYY-MM-DD&to=YYYY-MM-DD&sig=HMAC(secret, "stats|app_key|from|to")
 *   POST /v1/publisher/bans   { app_key, user_id, reason?, sig=HMAC(secret, "ban|app_key|user_id") }
 *   POST /v1/publisher/unbans { app_key, user_id, sig=HMAC(secret, "unban|app_key|user_id") }
 */

type Query = Record<string, string | undefined>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function registerPublisherApi(app: FastifyInstance, db: Db): void {
  const placementFor = async (appKey: string | undefined) => (appKey ? db.query.placements.findFirst({ where: (p, { eq }) => eq(p.appKey, appKey) }) : undefined);

  app.get<{ Querystring: Query }>('/v1/publisher/stats', async (req, reply) => {
    const { app_key: appKey, from, to, sig } = req.query;
    if (!appKey || !from || !to || !DAY.test(from) || !DAY.test(to)) return reply.code(400).send({ error: 'missing_parameters' });
    const placement = await placementFor(appKey);
    if (!placement) return reply.code(404).send({ error: 'unknown_placement' });
    if (!verify(placement.secret, ['stats', appKey, from, to], sig)) return reply.code(403).send({ error: 'invalid_signature' });
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
    if (Number.isNaN(days) || days < 1 || days > MAX_STATS_DAYS) return reply.code(400).send({ error: 'invalid_range', max_days: MAX_STATS_DAYS });
    return { app_key: appKey, currency_name: placement.currencyName, days: await placementDailyStats(db, placement.id, start, end) };
  });

  const banRoute = (path: string, prefix: 'ban' | 'unban') =>
    app.post<{ Body: Query | undefined }>(path, async (req, reply) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      if (!b.app_key || !b.user_id) return reply.code(400).send({ error: 'missing_parameters' });
      const placement = await placementFor(b.app_key);
      if (!placement) return reply.code(404).send({ error: 'unknown_placement' });
      if (!verify(placement.secret, [prefix, b.app_key, b.user_id], b.sig)) return reply.code(403).send({ error: 'invalid_signature' });
      if (prefix === 'ban') {
        const r = await banUser(db, placement.publisherOrgId, { userId: b.user_id, reason: b.reason ?? '' }, 'en');
        if (!r.ok) return reply.code(400).send({ error: 'invalid_parameters' });
      } else {
        await unbanUser(db, placement.publisherOrgId, b.user_id);
      }
      return { user_id: b.user_id, banned: prefix === 'ban' };
    });
  banRoute('/v1/publisher/bans', 'ban');
  banRoute('/v1/publisher/unbans', 'unban');
}

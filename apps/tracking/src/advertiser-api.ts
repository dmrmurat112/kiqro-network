import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { formatMicros } from '@kiqro/core';
import type { Db } from '@kiqro/db';
import { campaignRoas, creditPosition, dailyRevenue, decideClaim, listClaims, type CampaignRoas, type ClaimStatus } from '@kiqro/network';
import {
  advertiserCampaigns,
  advertiserConversions,
  advertiserDailySeries,
  advertiserSetPaused,
  authenticateApiKey,
  type AdvertiserSession,
  type PublicStatus,
} from '@kiqro/network/advertiser';

const RATE_LIMIT_PER_MINUTE = 300;

type Query = Record<string, string | undefined>;
const usd = (micros: bigint) => formatMicros(micros);

/**
 * Advertiser REST API (docs/advertiser-api.md): `Authorization: Bearer kq_live_…`, keys created
 * by team admins in the panel. JSON in snake_case; amounts are decimal strings in USD.
 */
export function registerAdvertiserApi(app: FastifyInstance, db: Db): void {
  const windows = new Map<string, { start: number; count: number }>();
  const sessions = new WeakMap<FastifyRequest, AdvertiserSession>();

  app.register(async (api) => {
    api.addHook('onRequest', async (req, reply) => {
      const header = req.headers.authorization ?? '';
      const key = header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
      const session = await authenticateApiKey(db, key);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });
      // Simple per-key limit (per instance), enough to stop runaway scripts.
      const now = Date.now();
      const w = windows.get(key!) ?? { start: now, count: 0 };
      if (now - w.start > 60_000) Object.assign(w, { start: now, count: 0 });
      w.count++;
      windows.set(key!, w);
      if (w.count > RATE_LIMIT_PER_MINUTE) return reply.code(429).send({ error: 'rate_limited' });
      sessions.set(req, session);
    });
    const who = (req: FastifyRequest) => sessions.get(req)!;

    api.get('/me', async (req) => {
      const { org, user } = who(req);
      const p = await creditPosition(db, org.id);
      return {
        organization: { id: org.id, name: org.name },
        key_owner: { name: user.name, email: user.email },
        balance_usd: usd(p.balance),
        credit_limit_usd: usd(p.creditLimit),
        spendable_usd: usd(p.spendable),
        credit_suspended: p.creditSuspended,
      };
    });

    api.get('/campaigns', async (req) => {
      const [rows, roas] = await Promise.all([advertiserCampaigns(db, who(req).org.id), campaignRoas(db, who(req).org.id)]);
      return {
        campaigns: rows.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          app: c.productName,
          platform: c.platform,
          countries: c.countries,
          total_budget_usd: usd(c.totalBudget),
          spend_usd: usd(c.spend),
          clicks: c.clicks,
          steps: c.tasks.map((t) => ({ seq: t.seq, event: t.event, name: t.name, completions: t.completions, spend_usd: usd(t.spend) })),
          ...roasFields(roas.find((r) => r.campaignId === c.id)),
        })),
      };
    });

    const setPaused = (paused: boolean) => async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const result = await advertiserSetPaused(db, who(req), req.params.id, paused, 'en');
      if (!result.ok) return reply.code(409).send({ error: result.issues[0]?.message ?? 'not_allowed' });
      return { id: req.params.id, status: paused ? 'paused' : 'active' };
    };
    api.post('/campaigns/:id/pause', setPaused(true));
    api.post('/campaigns/:id/resume', setPaused(false));

    api.get<{ Querystring: Query }>('/stats', async (req) => {
      const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
      const [series, revenue] = await Promise.all([advertiserDailySeries(db, who(req).org.id, days), dailyRevenue(db, who(req).org.id, days)]);
      return { days: series.map((d) => ({ date: d.date, spend_usd: usd(d.spend), revenue_usd: usd(revenue.get(d.date) ?? 0n), installs: d.installs, events: d.events })) };
    });

    api.get<{ Querystring: Query }>('/conversions', async (req, reply) => {
      const statuses: PublicStatus[] = ['billed', 'not_billed', 'in_review', 'refunded'];
      const status = req.query.status as PublicStatus | undefined;
      if (status && !statuses.includes(status)) return reply.code(400).send({ error: 'invalid_status' });
      const before = req.query.before ? new Date(req.query.before) : undefined;
      if (before && Number.isNaN(before.getTime())) return reply.code(400).send({ error: 'invalid_before' });
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
      const rows = await advertiserConversions(db, who(req).org.id, { status, campaignId: req.query.campaign_id, limit, before });
      return {
        conversions: rows.map((r) => ({
          id: r.id,
          created_at: r.createdAt.toISOString(),
          campaign: r.campaignName,
          event: r.event,
          click_id: r.clickId,
          country: r.country,
          status: r.status,
          reason: r.reason,
          price_usd: usd(r.price),
        })),
        // Pass as `before` to get the next page.
        next_before: rows.length === limit ? rows[rows.length - 1]!.createdAt.toISOString() : null,
      };
    });

    api.get<{ Querystring: Query }>('/claims', async (req) => {
      const status = ['open', 'approved', 'rejected'].includes(req.query.status ?? '') ? (req.query.status as ClaimStatus) : undefined;
      const rows = await listClaims(db, { orgId: who(req).org.id, status });
      return {
        claims: rows.map((c) => ({
          id: c.id,
          status: c.status,
          campaign_id: c.campaignId,
          event: c.taskEvent,
          click_id: c.clickId,
          clicked_at: c.clickedAt.toISOString(),
          country: c.country,
          user_note: c.userNote,
          decision_note: c.decisionNote,
          created_at: c.createdAt.toISOString(),
        })),
      };
    });

    const decide = (approve: boolean) => async (req: FastifyRequest<{ Params: { id: string }; Body: { note?: string } | undefined }>, reply: FastifyReply) => {
      const { org, user } = who(req);
      const result = await decideClaim(db, req.params.id, { approve, note: req.body?.note ?? '', orgId: org.id, advertiserUserId: user.id });
      if (!result.ok) return reply.code(result.reason === 'claim_not_found' ? 404 : 409).send({ error: result.reason });
      return { id: req.params.id, status: approve ? 'approved' : 'rejected' };
    };
    api.post('/claims/:id/approve', decide(true));
    api.post('/claims/:id/reject', decide(false));
  }, { prefix: '/v1/advertiser' });
}

/** ROAS fields of a campaign in API responses; ratios are revenue / spend (1 = break-even). */
function roasFields(r: CampaignRoas | undefined) {
  return {
    revenue_usd: usd(r?.revenue ?? 0n),
    revenue_d7_usd: usd(r?.revenueD7 ?? 0n),
    revenue_d30_usd: usd(r?.revenueD30 ?? 0n),
    paying_users: r?.payingUsers ?? 0,
    roas_d7: r?.roasD7 ?? null,
    roas_d30: r?.roasD30 ?? null,
    roas: r?.roas ?? null,
  };
}

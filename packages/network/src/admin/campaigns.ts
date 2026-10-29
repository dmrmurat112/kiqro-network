import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { formatMicros, macrosIn, parseMicros } from '@kiqro/core';
import { newId, schema, type Db, type Tx } from '@kiqro/db';
import { campaignSpend } from '../campaigns.ts';
import { enqueueEmail } from '../email/queue.ts';
import type { EmailTemplate } from '../email/templates.ts';
import { audit } from './audit.ts';
import type { AdminUser } from './auth.ts';
import { AdminError, requirePermission } from './errors.ts';
import { countrySchema, intField, parseInput, usdSchema } from './organizations.ts';

const { advertiserUsers, campaignTasks, campaigns, clicks, organizations, products, taskPayouts } = schema;

const optionalUsd = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .pipe(usdSchema.optional());

const optionalDate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'date' });
      return z.NEVER;
    }
    return d;
  });

const taskInput = z.object({
  event: z.string().trim().min(1, 'event_required').max(100),
  timeLimitDays: intField(1, 90),
  nameEn: z.string().trim().min(1, 'task_name_required'),
  nameTr: z.string().trim().default(''),
  /** "*" is the default price; other keys are country codes. */
  prices: z.array(z.object({ country: z.union([z.literal('*'), countrySchema]), priceUsd: usdSchema })).min(1, 'prices_required'),
});

export const campaignInput = z
  .object({
    productId: z.string().min(1, 'product_required'),
    name: z.string().trim().min(2),
    trackingUrl: z
      .string()
      .trim()
      .url('url_invalid')
      .refine((v) => v.startsWith('https://'), 'url_https')
      .refine((v) => macrosIn(v).includes('click_id'), 'tracking_click_id'),
    countries: z.array(countrySchema).min(1, 'countries_required'),
    totalBudgetUsd: usdSchema,
    dailyBudgetUsd: optionalUsd,
    startAt: optionalDate,
    endAt: optionalDate,
    attributionWindowDays: intField(1, 30),
    ctitMinSeconds: intField(0, 3600),
    titleEn: z.string().trim().min(2, 'title_en_required'),
    titleTr: z.string().trim().default(''),
    descriptionEn: z.string().trim().default(''),
    descriptionTr: z.string().trim().default(''),
    tasks: z.array(taskInput).min(1, 'tasks_required'),
  })
  .superRefine((c, ctx) => {
    const events = c.tasks.map((t) => t.event);
    if (new Set(events).size !== events.length) ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'duplicate_event' });
    c.tasks.forEach((t, i) => {
      const priced = new Set(t.prices.map((p) => p.country));
      if (priced.size !== t.prices.length) ctx.addIssue({ code: 'custom', path: ['tasks', i, 'prices'], message: 'duplicate_country' });
      const uncovered = c.countries.filter((country) => !priced.has(country));
      if (!priced.has('*') && uncovered.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['tasks', i, 'prices'], message: `uncovered_countries|${uncovered.join(', ')}` });
      }
    });
    if (c.startAt && c.endAt && c.endAt <= c.startAt) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'end_before_start' });
    if (c.dailyBudgetUsd && parseMicros(c.dailyBudgetUsd) > parseMicros(c.totalBudgetUsd)) {
      ctx.addIssue({ code: 'custom', path: ['dailyBudgetUsd'], message: 'daily_over_total' });
    }
  });

export type CampaignInput = z.input<typeof campaignInput>;

export function campaignValues(data: z.output<typeof campaignInput>) {
  return {
    name: data.name,
    trackingUrl: data.trackingUrl,
    countries: [...new Set(data.countries)],
    totalBudget: parseMicros(data.totalBudgetUsd),
    dailyBudget: data.dailyBudgetUsd ? parseMicros(data.dailyBudgetUsd) : null,
    startAt: data.startAt,
    endAt: data.endAt,
    attributionWindowDays: data.attributionWindowDays,
    ctitMinSeconds: data.ctitMinSeconds,
    title: { en: data.titleEn, ...(data.titleTr ? { tr: data.titleTr } : {}) },
    description: { en: data.descriptionEn, ...(data.descriptionTr ? { tr: data.descriptionTr } : {}) },
  };
}

export async function writeTasks(tx: Tx, campaignId: string, tasks: z.output<typeof campaignInput>['tasks']): Promise<void> {
  for (const [index, task] of tasks.entries()) {
    const taskId = newId('task');
    await tx.insert(campaignTasks).values({
      id: taskId,
      campaignId,
      seq: index + 1,
      mmpEventName: task.event,
      timeLimitDays: task.timeLimitDays,
      displayName: { en: task.nameEn, ...(task.nameTr ? { tr: task.nameTr } : {}) },
    });
    await tx.insert(taskPayouts).values(task.prices.map((p) => ({ id: newId('payout'), taskId, country: p.country, price: parseMicros(p.priceUsd) })));
  }
}

/** Creates a campaign as a draft. It only serves traffic after setCampaignStatus(..., 'active'). */
export async function createCampaign(db: Db, actor: AdminUser, input: CampaignInput): Promise<string> {
  requirePermission(actor, 'manage_campaigns');
  const data = parseInput(campaignInput, input);
  const id = newId('campaign');
  await db.transaction(async (tx) => {
    const product = await tx.query.products.findFirst({ where: eq(products.id, data.productId) });
    if (!product) throw new AdminError('Ürün bulunamadı.');
    await tx.insert(campaigns).values({ id, orgId: product.orgId, productId: product.id, status: 'draft', ...campaignValues(data) });
    await writeTasks(tx, id, data.tasks);
    await audit(tx, actor.id, 'campaign.create', 'campaign', id, { name: data.name });
  });
  return id;
}

/**
 * Updates a campaign. Tasks and prices can only be replaced while the campaign has no clicks:
 * users who started an offer were promised a reward, and payouts are looked up at conversion time.
 */
export async function updateCampaign(db: Db, actor: AdminUser, campaignId: string, input: CampaignInput): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  const data = parseInput(campaignInput, input);
  await db.transaction(async (tx) => {
    const campaign = await tx.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) throw new AdminError('Kampanya bulunamadı.');
    if (campaign.productId !== data.productId) throw new AdminError('Kampanyanın ürünü değiştirilemez.');

    const [clickCount] = await tx.select({ n: count() }).from(clicks).where(eq(clicks.campaignId, campaignId));
    const tasksChanged = JSON.stringify(await taskSnapshot(tx, campaignId)) !== JSON.stringify(normalizeTasks(data.tasks));
    if (tasksChanged && clickCount!.n > 0) {
      throw new AdminError('Bu kampanyada tıklama olduğu için görevler ve fiyatlar değiştirilemez. Yeni fiyatlar için kampanyayı kopyalayın.');
    }

    await tx.update(campaigns).set(campaignValues(data)).where(eq(campaigns.id, campaignId));
    if (tasksChanged) {
      const old = await tx.select({ id: campaignTasks.id }).from(campaignTasks).where(eq(campaignTasks.campaignId, campaignId));
      if (old.length) {
        await tx.delete(taskPayouts).where(inArray(taskPayouts.taskId, old.map((t) => t.id)));
        await tx.delete(campaignTasks).where(eq(campaignTasks.campaignId, campaignId));
      }
      await writeTasks(tx, campaignId, data.tasks);
    }
    await audit(tx, actor.id, 'campaign.update', 'campaign', campaignId, { tasksChanged });
  });
}

type TaskSnapshot = { event: string; timeLimitDays: number; nameEn: string; nameTr: string; prices: { country: string; priceUsd: string }[] };

export function normalizeTasks(tasks: z.output<typeof campaignInput>['tasks']): TaskSnapshot[] {
  return tasks.map((t) => ({
    event: t.event,
    timeLimitDays: t.timeLimitDays,
    nameEn: t.nameEn,
    nameTr: t.nameTr,
    prices: t.prices.map((p) => ({ country: p.country, priceUsd: formatMicros(parseMicros(p.priceUsd)) })).sort((a, b) => a.country.localeCompare(b.country)),
  }));
}

export async function taskSnapshot(db: Db | Tx, campaignId: string): Promise<TaskSnapshot[]> {
  const tasks = await db.select().from(campaignTasks).where(eq(campaignTasks.campaignId, campaignId)).orderBy(campaignTasks.seq);
  const prices = tasks.length ? await db.select().from(taskPayouts).where(inArray(taskPayouts.taskId, tasks.map((t) => t.id))) : [];
  return tasks.map((t) => ({
    event: t.mmpEventName,
    timeLimitDays: t.timeLimitDays,
    nameEn: t.displayName.en ?? '',
    nameTr: t.displayName.tr ?? '',
    prices: prices
      .filter((p) => p.taskId === t.id)
      .map((p) => ({ country: p.country, priceUsd: formatMicros(p.price) }))
      .sort((a, b) => a.country.localeCompare(b.country)),
  }));
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  in_review: ['active', 'draft', 'archived'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export async function setCampaignStatus(db: Db, actor: AdminUser, campaignId: string, status: (typeof campaigns.$inferSelect)['status']): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  await db.transaction(async (tx) => {
    const campaign = await tx.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) throw new AdminError('Kampanya bulunamadı.');
    if (!ALLOWED_TRANSITIONS[campaign.status]!.includes(status)) {
      throw new AdminError(`Kampanya "${campaign.status}" durumundan "${status}" durumuna geçirilemez.`);
    }
    if (status === 'active') {
      const advertiser = await tx.query.organizations.findFirst({ where: eq(organizations.id, campaign.orgId) });
      if (advertiser?.status !== 'active') throw new AdminError('Reklamveren hesabı aktif değil.');
    }
    await tx.update(campaigns).set({ status }).where(eq(campaigns.id, campaignId));
    await audit(tx, actor.id, 'campaign.status', 'campaign', campaignId, { from: campaign.status, to: status });
  });
}

export interface ReviewLinks {
  advertiseBaseUrl: string;
}

async function notifyAdvertiserUsers(tx: Tx, orgId: string, build: (user: typeof advertiserUsers.$inferSelect) => EmailTemplate, now: Date) {
  const users = await tx.select().from(advertiserUsers).where(and(eq(advertiserUsers.orgId, orgId), isNull(advertiserUsers.disabledAt)));
  for (const user of users) await enqueueEmail(tx, user.email, build(user), user.locale === 'tr' ? 'tr' : 'en', now);
}

/** Approves a self-serve campaign submitted for review: it goes live and the advertiser is told. */
export async function approveCampaign(db: Db, actor: AdminUser, campaignId: string, links: ReviewLinks, now = new Date()): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  await db.transaction(async (tx) => {
    const campaign = await tx.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) throw new AdminError('Kampanya bulunamadı.');
    if (campaign.status !== 'in_review') throw new AdminError('Yalnızca incelemedeki kampanyalar onaylanabilir.');
    const advertiser = await tx.query.organizations.findFirst({ where: eq(organizations.id, campaign.orgId) });
    if (advertiser?.status !== 'active') throw new AdminError('Reklamveren hesabı aktif değil.');
    await tx.update(campaigns).set({ status: 'active', reviewedAt: now, reviewNote: null }).where(eq(campaigns.id, campaignId));
    await audit(tx, actor.id, 'campaign.approve', 'campaign', campaignId);
    const panelLink = `${links.advertiseBaseUrl.replace(/\/$/, '')}/app/campaigns`;
    await notifyAdvertiserUsers(tx, campaign.orgId, (u) => ({ name: 'campaign_approved', data: { name: u.name, campaign: campaign.title.en ?? campaign.name, panelLink } }), now);
  });
}

/** Sends a submitted campaign back to draft with a note telling the advertiser what to change. */
export async function returnCampaign(db: Db, actor: AdminUser, campaignId: string, note: string, links: ReviewLinks, now = new Date()): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  const text = note.trim();
  if (text.length < 5) throw new AdminError('Reklamverene ne değiştirmesi gerektiğini yazın.');
  await db.transaction(async (tx) => {
    const campaign = await tx.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) throw new AdminError('Kampanya bulunamadı.');
    if (campaign.status !== 'in_review') throw new AdminError('Yalnızca incelemedeki kampanyalar geri gönderilebilir.');
    await tx.update(campaigns).set({ status: 'draft', reviewedAt: now, reviewNote: text.slice(0, 2000) }).where(eq(campaigns.id, campaignId));
    await audit(tx, actor.id, 'campaign.return', 'campaign', campaignId, { note: text });
    const editLink = `${links.advertiseBaseUrl.replace(/\/$/, '')}/app/campaigns/${campaignId}/edit`;
    await notifyAdvertiserUsers(tx, campaign.orgId, (u) => ({ name: 'campaign_returned', data: { name: u.name, campaign: campaign.title.en ?? campaign.name, note: text, editLink } }), now);
  });
}

export async function listCampaigns(db: Db, filter: { orgId?: string } = {}) {
  const rows = await db
    .select({ campaign: campaigns, advertiserName: organizations.name, productName: products.name, platform: products.platform })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .innerJoin(products, eq(products.id, campaigns.productId))
    .where(filter.orgId ? eq(campaigns.orgId, filter.orgId) : undefined)
    .orderBy(desc(campaigns.createdAt));
  return Promise.all(rows.map(async (r) => ({ ...r, spend: await campaignSpend(db, r.campaign.id) })));
}

/** Campaign with its tasks in the same shape as the create/edit form. */
export async function getCampaignForm(db: Db, campaignId: string) {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!campaign) return null;
  const [clickCount] = await db.select({ n: count() }).from(clicks).where(eq(clicks.campaignId, campaignId));
  const form: z.input<typeof campaignInput> = {
    productId: campaign.productId,
    name: campaign.name,
    trackingUrl: campaign.trackingUrl,
    countries: campaign.countries,
    totalBudgetUsd: formatMicros(campaign.totalBudget),
    dailyBudgetUsd: campaign.dailyBudget === null ? '' : formatMicros(campaign.dailyBudget),
    startAt: campaign.startAt?.toISOString().slice(0, 16) ?? '',
    endAt: campaign.endAt?.toISOString().slice(0, 16) ?? '',
    attributionWindowDays: campaign.attributionWindowDays,
    ctitMinSeconds: campaign.ctitMinSeconds,
    titleEn: campaign.title.en ?? '',
    titleTr: campaign.title.tr ?? '',
    descriptionEn: campaign.description.en ?? '',
    descriptionTr: campaign.description.tr ?? '',
    tasks: await taskSnapshot(db, campaignId),
  };
  return { campaign, form, hasClicks: clickCount!.n > 0, spend: await campaignSpend(db, campaignId) };
}

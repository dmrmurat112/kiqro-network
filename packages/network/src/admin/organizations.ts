import { randomBytes } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { formatMicros, parseMicros } from '@kiqro/core';
import { getAccountId, newId, schema, type Db } from '@kiqro/db';
import { recordReceivedPayment } from '../billing/payments.ts';
import { audit } from './audit.ts';
import type { AdminUser } from './auth.ts';
import { AdminError, describeValidation, requirePermission } from './errors.ts';

const { ledgerAccounts, ledgerEntries, organizations, placements, products } = schema;

const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'country_code');
/** Integer from a form field (string) or code (number). */
export const intField = (min: number, max: number) => z.union([z.number(), z.string()]).pipe(z.coerce.number().int().min(min).max(max));

const usd = z.string().trim().regex(/^\d+(\.\d{1,6})?$/, 'amount');

function parse<T extends z.ZodTypeAny>(schemaDef: T, input: unknown): z.infer<T> {
  const result = schemaDef.safeParse(input);
  if (!result.success) throw new AdminError(describeValidation(result.error));
  return result.data;
}

const secret = () => randomBytes(24).toString('hex');

// ---------- Advertisers ----------

export const advertiserInput = z.object({
  name: z.string().trim().min(2, 'name_short'),
  country,
  billingEntity: z.enum(['kiqro_inc', 'kiqro_oy']),
  invoiceCurrency: z.enum(['USD', 'EUR']),
  reversalWindowDays: intField(1, 90),
  // HTML checkboxes send "on" when ticked and nothing otherwise.
  requireSignedPostbacks: z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean()),
});

export async function createAdvertiser(db: Db, actor: AdminUser, input: z.input<typeof advertiserInput>): Promise<string> {
  requirePermission(actor, 'manage_campaigns');
  const data = parse(advertiserInput, input);
  const id = newId('org');
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id,
      type: 'advertiser',
      name: data.name,
      country: data.country,
      status: 'active',
      billingEntity: data.billingEntity,
      invoiceCurrency: data.invoiceCurrency,
      reversalWindowDays: data.reversalWindowDays,
      postbackKey: `adv_${randomBytes(8).toString('hex')}`,
      postbackSecret: data.requireSignedPostbacks ? secret() : null,
    });
    await audit(tx, actor.id, 'advertiser.create', 'organization', id, { name: data.name });
  });
  return id;
}

/** Organizations of one type with their ledger balance (advertiser balance or publisher payable). */
export async function listOrganizations(db: Db, type: 'advertiser' | 'publisher') {
  const kind = type === 'advertiser' ? 'advertiser_balance' : 'publisher_payable';
  const orgs = await db.select().from(organizations).where(eq(organizations.type, type)).orderBy(desc(organizations.createdAt));
  const balances = await db
    .select({ orgId: ledgerAccounts.orgId, total: sql<string>`sum(${ledgerEntries.amount})` })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(eq(ledgerAccounts.kind, kind))
    .groupBy(ledgerAccounts.orgId);
  const byOrg = new Map(balances.map((b) => [b.orgId, BigInt(b.total)]));
  return orgs.map((org) => ({ ...org, balance: byOrg.get(org.id) ?? 0n }));
}

export async function getOrganization(db: Db, id: string) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
  if (!org) return null;
  const kind = org.type === 'advertiser' ? 'advertiser_balance' : 'publisher_payable';
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, await getAccountId(db, kind, org.id)));
  return { ...org, balance: BigInt(row!.total) };
}

export const topUpInput = z.object({
  amountUsd: usd,
  memo: z.string().trim().min(3, 'açıklama gerekli (ör. havale referansı)').max(200),
  method: z.enum(['bank_transfer', 'other']).default('bank_transfer'),
});

/**
 * Records money received outside Stripe (bank transfer): balance, payment history, applied to
 * open invoices, receipt e-mail. Card payments are credited by the Stripe webhook instead.
 */
export async function recordTopUp(db: Db, actor: AdminUser, orgId: string, input: z.input<typeof topUpInput>, links: { advertiseBaseUrl: string }): Promise<void> {
  requirePermission(actor, 'move_money');
  const data = parse(topUpInput, input);
  const amount = parseMicros(data.amountUsd);
  if (amount <= 0n) throw new AdminError('Tutar sıfırdan büyük olmalı.');
  await db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (org?.type !== 'advertiser') throw new AdminError('Reklamveren bulunamadı.');
    const paymentId = await recordReceivedPayment(tx, { orgId, amount, method: data.method, reference: data.memo, adminUserId: actor.id }, links.advertiseBaseUrl);
    await audit(tx, actor.id, 'advertiser.topup', 'organization', orgId, { amountUsd: formatMicros(amount), memo: data.memo, method: data.method, paymentId });
  });
}

export const creditTermsInput = z.object({
  creditLimitUsd: usd,
  paymentTermsDays: intField(7, 90),
});

/**
 * Sets an advertiser's credit line (0 = prepaid only) and invoice payment terms. Only for
 * advertisers Kiqro has credit-checked; debt above the prepaid balance is invoiced monthly.
 */
export async function setCreditTerms(db: Db, actor: AdminUser, orgId: string, input: z.input<typeof creditTermsInput>): Promise<void> {
  requirePermission(actor, 'move_money');
  const data = parse(creditTermsInput, input);
  const creditLimit = parseMicros(data.creditLimitUsd);
  await db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (org?.type !== 'advertiser') throw new AdminError('Reklamveren bulunamadı.');
    await tx.update(organizations).set({ creditLimit, paymentTermsDays: data.paymentTermsDays }).where(eq(organizations.id, orgId));
    await audit(tx, actor.id, 'advertiser.credit_terms', 'organization', orgId, {
      before: { creditLimitUsd: formatMicros(org.creditLimit), paymentTermsDays: org.paymentTermsDays },
      after: { creditLimitUsd: formatMicros(creditLimit), paymentTermsDays: data.paymentTermsDays },
    });
  });
}

// ---------- Products ----------

export const productInput = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  storeId: z.string().trim().min(3, 'store_id_required'),
  name: z.string().trim().min(2),
  iconUrl: z.string().trim().url('url_invalid').optional().or(z.literal('').transform(() => undefined)),
  /** Wide offerwall banner; any https image (campaigns are reviewed by Kiqro before they run). */
  coverUrl: z
    .string()
    .trim()
    .max(500)
    .url('url_invalid')
    .refine((v) => v.startsWith('https://'), 'url_https')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  mmp: z.enum(['appsflyer', 'adjust', 'singular', 'kochava', 'branch', 'tenjin', 'none']),
});

export async function createProduct(db: Db, actor: AdminUser, orgId: string, input: z.input<typeof productInput>): Promise<string> {
  requirePermission(actor, 'manage_campaigns');
  const data = parse(productInput, input);
  const id = newId('product');
  await db.transaction(async (tx) => {
    await tx.insert(products).values({ id, orgId, platform: data.platform, storeId: data.storeId, name: data.name, iconUrl: data.iconUrl ?? null, coverUrl: data.coverUrl ?? null, mmp: data.mmp });
    await audit(tx, actor.id, 'product.create', 'product', id, { orgId, name: data.name });
  });
  return id;
}

export async function listProducts(db: Db, orgId: string) {
  return db.select().from(products).where(eq(products.orgId, orgId)).orderBy(desc(products.createdAt));
}

// ---------- Publishers and placements ----------

export const publisherInput = z.object({ name: z.string().trim().min(2), country });

export async function createPublisher(db: Db, actor: AdminUser, input: z.input<typeof publisherInput>): Promise<string> {
  requirePermission(actor, 'manage_publishers');
  const data = parse(publisherInput, input);
  const id = newId('org');
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({ id, type: 'publisher', name: data.name, country: data.country, status: 'active' });
    await audit(tx, actor.id, 'publisher.create', 'organization', id, { name: data.name });
  });
  return id;
}

const postbackUrl = z
  .string()
  .trim()
  .refine((v) => v === '' || /^https:\/\//.test(v) || /^http:\/\/localhost[:/]/.test(v), 'https:// ile başlamalı')
  .transform((v) => (v === '' ? null : v));

export const placementInput = z.object({
  name: z.string().trim().min(2),
  currencyName: z.string().trim().min(1),
  pointsPerUsd: z.string().trim().regex(/^\d+(\.\d{1,6})?$/, 'sayı olmalı (ör. 1000)'),
  revsharePercent: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, 'yüzde olmalı (ör. 70)'),
  postbackUrl,
  status: z.enum(['active', 'paused']).default('active'),
});

const percentToBps = (percent: string) => {
  const bps = Math.round(Number(percent) * 100);
  if (bps < 0 || bps > 10_000) throw new AdminError('Gelir payı %0 ile %100 arasında olmalı.');
  return bps;
};

export async function createPlacement(db: Db, actor: AdminUser, publisherOrgId: string, input: z.input<typeof placementInput>): Promise<string> {
  requirePermission(actor, 'manage_publishers');
  const data = parse(placementInput, input);
  const id = newId('placement');
  await db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, publisherOrgId) });
    if (org?.type !== 'publisher') throw new AdminError('Yayıncı bulunamadı.');
    await tx.insert(placements).values({
      id,
      publisherOrgId,
      name: data.name,
      appKey: `app_${randomBytes(8).toString('hex')}`,
      secret: secret(),
      status: data.status,
      currencyName: data.currencyName,
      pointsPerUsd: data.pointsPerUsd,
      revshareBps: percentToBps(data.revsharePercent),
      postbackUrl: data.postbackUrl,
    });
    await audit(tx, actor.id, 'placement.create', 'placement', id, { publisherOrgId, revsharePercent: data.revsharePercent });
  });
  return id;
}

export async function updatePlacement(db: Db, actor: AdminUser, placementId: string, input: z.input<typeof placementInput>): Promise<void> {
  requirePermission(actor, 'manage_publishers');
  const data = parse(placementInput, input);
  await db.transaction(async (tx) => {
    const before = await tx.query.placements.findFirst({ where: eq(placements.id, placementId) });
    if (!before) throw new AdminError('Placement bulunamadı.');
    const revshareBps = percentToBps(data.revsharePercent);
    await tx
      .update(placements)
      .set({ name: data.name, currencyName: data.currencyName, pointsPerUsd: data.pointsPerUsd, revshareBps, postbackUrl: data.postbackUrl, status: data.status })
      .where(eq(placements.id, placementId));
    await audit(tx, actor.id, 'placement.update', 'placement', placementId, {
      before: { revshareBps: before.revshareBps, pointsPerUsd: before.pointsPerUsd, postbackUrl: before.postbackUrl, status: before.status },
      after: { revshareBps, pointsPerUsd: data.pointsPerUsd, postbackUrl: data.postbackUrl, status: data.status },
    });
  });
}

export async function listPlacements(db: Db, publisherOrgId: string) {
  return db.select().from(placements).where(eq(placements.publisherOrgId, publisherOrgId)).orderBy(desc(placements.createdAt));
}

export { country as countrySchema, usd as usdSchema, parse as parseInput };

import { eq, sql } from 'drizzle-orm';
import { schema, type Db } from '@kiqro/db';
import { audit } from './admin/audit.ts';
import type { AdminUser } from './admin/auth.ts';
import { AdminError, requirePermission } from './admin/errors.ts';

const { siteSettings } = schema;

/**
 * Recommended minimum prices for the campaign wizard's quick-add events, and the help text shown
 * next to the price field. Set by Kiqro in the admin panel; advertisers may still price lower.
 */
export const PRICING_EVENTS = ['install', 'registration', 'level', 'deposit', 'kyc', 'purchase', 'subscription', 'trial'] as const;
export type PricingEvent = (typeof PRICING_EVENTS)[number];

export interface PricingGuide {
  /** USD with up to two decimals, e.g. "0.60". */
  prices: Record<PricingEvent, string>;
  help: { en: string; tr: string };
}

export const DEFAULT_PRICING_GUIDE: PricingGuide = {
  prices: { install: '0.60', registration: '1.50', level: '2.50', deposit: '15.00', kyc: '5.00', purchase: '6.00', subscription: '8.00', trial: '3.00' },
  help: {
    en: 'The recommended price is what users find worth completing this step for on offerwalls. Pricing at or above it puts your offer higher in the list and gets your campaign completed faster. You can set a lower price; completions may then come in more slowly.',
    tr: 'Tavsiye edilen fiyat, kullanıcıların offerwall’larda bu adımı tamamlamaya değer bulduğu seviyedir. Bu fiyat ve üzeri teklifinizi listede öne çıkarır ve kampanyanızın daha hızlı tamamlanmasını sağlar. Daha düşük bir fiyat da belirleyebilirsiniz; bu durumda tamamlanmalar daha yavaş gelebilir.',
  },
};

const KEY = 'pricing_guide';
const PRICE = /^\d{1,4}(\.\d{1,2})?$/;
const MAX_HELP = 600;

/** The guide with Kiqro's saved values over the defaults (new events get their default price). */
export async function loadPricingGuide(db: Db): Promise<PricingGuide> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, KEY) });
  const saved = (row?.value ?? {}) as Partial<{ prices: Partial<Record<PricingEvent, string>>; help: Partial<PricingGuide['help']> }>;
  return {
    prices: { ...DEFAULT_PRICING_GUIDE.prices, ...saved.prices },
    help: { en: saved.help?.en || DEFAULT_PRICING_GUIDE.help.en, tr: saved.help?.tr || DEFAULT_PRICING_GUIDE.help.tr },
  };
}

/** Saves the recommended prices and help text. An empty help text falls back to the default. */
export async function savePricingGuide(db: Db, actor: AdminUser, input: { prices: Partial<Record<string, string>>; help: { en?: string; tr?: string } }): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  const prices = {} as Record<PricingEvent, string>;
  for (const event of PRICING_EVENTS) {
    const value = (input.prices[event] ?? '').trim().replace(',', '.');
    if (!PRICE.test(value) || Number(value) <= 0) throw new AdminError(`${event}: geçerli bir USD tutarı girin (ör. 2.50).`);
    prices[event] = Number(value).toFixed(2);
  }
  const help = { en: (input.help.en ?? '').trim(), tr: (input.help.tr ?? '').trim() };
  if (help.en.length > MAX_HELP || help.tr.length > MAX_HELP) throw new AdminError(`Açıklama en fazla ${MAX_HELP} karakter olabilir.`);
  const value = { prices, help };
  await db.transaction(async (tx) => {
    await tx
      .insert(siteSettings)
      .values({ key: KEY, value, updatedBy: actor.id })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.id, updatedAt: sql`now()` } });
    await audit(tx, actor.id, 'pricing_guide.updated', 'site', KEY, { prices });
  });
}

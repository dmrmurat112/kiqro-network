import { eq, sql } from 'drizzle-orm';
import { schema, type Db } from '@kiqro/db';
import { audit } from './admin/audit.ts';
import type { AdminUser } from './admin/auth.ts';
import { AdminError, requirePermission } from './admin/errors.ts';

const { siteSettings } = schema;

/**
 * Recommended minimum prices for some of the campaign wizard's quick-add events, per app platform, and
 * the help text shown next to the price field. Set by Kiqro in the admin panel; advertisers may
 * still price lower.
 */
/** Quick-add events with a recommended price; level, deposit, purchase and subscription have none. */
export const PRICING_EVENTS = ['install', 'registration', 'kyc', 'trial'] as const;
export type PricingEvent = (typeof PRICING_EVENTS)[number];
/** Web apps use the Android prices. */
export const PRICING_PLATFORMS = ['android', 'ios'] as const;
export type PricingPlatform = (typeof PRICING_PLATFORMS)[number];

export interface PricingGuide {
  /** USD with two decimals, e.g. "0.60", per platform and event. */
  prices: Record<PricingPlatform, Record<PricingEvent, string>>;
  help: { en: string; tr: string };
}

export const DEFAULT_PRICING_GUIDE: PricingGuide = {
  prices: {
    android: { install: '0.60', registration: '1.50', kyc: '5.00', trial: '3.00' },
    ios: { install: '1.00', registration: '2.00', kyc: '6.00', trial: '4.00' },
  },
  help: {
    en: 'The recommended price is what users find worth completing this step for on offerwalls. Pricing at or above it puts your offer higher in the list and gets your campaign completed faster. You can set a lower price; completions may then come in more slowly.',
    tr: 'Tavsiye edilen fiyat, kullanıcıların offerwall’larda bu adımı tamamlamaya değer bulduğu seviyedir. Bu fiyat ve üzeri teklifinizi listede öne çıkarır ve kampanyanızın daha hızlı tamamlanmasını sağlar. Daha düşük bir fiyat da belirleyebilirsiniz; bu durumda tamamlanmalar daha yavaş gelebilir.',
  },
};

/** The recommended prices for an app's platform (web uses Android's). */
export const platformPrices = (guide: PricingGuide, platform: string): Record<PricingEvent, string> => guide.prices[platform === 'ios' ? 'ios' : 'android'];

const KEY = 'pricing_guide';
const PRICE = /^\d{1,4}(\.\d{1,2})?$/;
const MAX_HELP = 600;

type Saved = Partial<{ prices: Partial<Record<string, unknown>>; help: Partial<PricingGuide['help']> }>;

/** The guide with Kiqro's saved values over the defaults (new events get their default price). */
export async function loadPricingGuide(db: Db): Promise<PricingGuide> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, KEY) });
  const saved = (row?.value ?? {}) as Saved;
  // The first version stored one price list for every platform; it now seeds both.
  const legacy = saved.prices && typeof saved.prices.install === 'string' ? (saved.prices as Partial<Record<PricingEvent, string>>) : undefined;
  const forPlatform = (p: PricingPlatform) => {
    const stored = legacy ?? (saved.prices?.[p] as Partial<Record<string, string>> | undefined) ?? {};
    // Only events that still have a recommendation (older saves may hold prices for others).
    return Object.fromEntries(PRICING_EVENTS.map((e) => [e, stored[e] ?? DEFAULT_PRICING_GUIDE.prices[p][e]])) as Record<PricingEvent, string>;
  };
  return {
    prices: { android: forPlatform('android'), ios: forPlatform('ios') },
    help: { en: saved.help?.en || DEFAULT_PRICING_GUIDE.help.en, tr: saved.help?.tr || DEFAULT_PRICING_GUIDE.help.tr },
  };
}

/** Saves the recommended prices and help text. An empty help text falls back to the default. */
export async function savePricingGuide(
  db: Db,
  actor: AdminUser,
  input: { prices: Partial<Record<PricingPlatform, Partial<Record<string, string>>>>; help: { en?: string; tr?: string } },
): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  const label = { android: 'Android', ios: 'iOS' };
  const prices = { android: {}, ios: {} } as PricingGuide['prices'];
  for (const platform of PRICING_PLATFORMS) {
    for (const event of PRICING_EVENTS) {
      const value = (input.prices[platform]?.[event] ?? '').trim().replace(',', '.');
      if (!PRICE.test(value) || Number(value) <= 0) throw new AdminError(`${label[platform]} · ${event}: geçerli bir USD tutarı girin (ör. 2.50).`);
      prices[platform][event] = Number(value).toFixed(2);
    }
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

import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema, type Db } from '@kiqro/db';
import { lookupStoreApp, parseStoreInput, websiteApp, type StoreApp } from './store-lookup.ts';

const { products } = schema;

type Lookup = (raw: string, platform: string) => Promise<StoreApp | null>;

const defaultLookup: Lookup = async (raw, platform) => {
  if (platform === 'web') return websiteApp(raw);
  const ref = parseStoreInput(raw, platform);
  return ref ? lookupStoreApp(ref) : null;
};

/**
 * Fills in missing icons of apps (added before icons existed, by staff in the admin panel, or
 * while a store was unreachable). Only the icon is set; names and store IDs stay as entered.
 * Runs from the worker; apps whose lookup fails are tried again on a later run.
 */
export async function backfillProductIcons(db: Db, opts: { limit?: number; skip?: Set<string>; lookup?: Lookup } = {}): Promise<number> {
  const skip = opts.skip ?? new Set<string>();
  const rows = await db
    .select({ id: products.id, platform: products.platform, storeId: products.storeId })
    .from(products)
    .where(isNull(products.iconUrl))
    .orderBy(asc(products.createdAt))
    .limit((opts.limit ?? 20) + skip.size);
  let filled = 0;
  for (const row of rows.filter((r) => !skip.has(r.id)).slice(0, opts.limit ?? 20)) {
    const app = await (opts.lookup ?? defaultLookup)(row.storeId, row.platform).catch(() => null);
    if (!app?.iconUrl || app.platform !== row.platform) {
      skip.add(row.id);
      continue;
    }
    await db.update(products).set({ iconUrl: app.iconUrl }).where(and(eq(products.id, row.id), isNull(products.iconUrl)));
    filled++;
  }
  return filled;
}

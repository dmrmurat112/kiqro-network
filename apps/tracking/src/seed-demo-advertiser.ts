/**
 * Local development only: fills the database with a demo advertiser that has ~30 days of
 * realistic traffic (installs, level and purchase events, some filtered conversions) and a
 * panel login, so the advertiser panel can be reviewed with data.
 *   npm run seed:demo-advertiser
 * Login: demo@advertiser.test, password from DEV_ADVERTISER_PASSWORD in .env (generated if missing).
 */
import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { sign } from '@kiqro/core';
import { createDb, schema } from '@kiqro/db';
import { createDemoSetup, handleClick, handlePostback } from '@kiqro/network';
import { hashPassword } from '@kiqro/network/admin';

if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.includes('localhost')) {
  console.error('Only for the local development database.');
  process.exit(1);
}

const EMAIL = 'demo@advertiser.test';
const { db, pool } = createDb();

if (await db.query.advertiserUsers.findFirst({ where: eq(schema.advertiserUsers.email, EMAIL) })) {
  console.log(`${EMAIL} already exists; nothing to do.`);
  await pool.end();
  process.exit(0);
}

const s = await createDemoSetup(db, { topUpUsd: '25000', totalBudgetUsd: '60000' });
await db.update(schema.organizations).set({ name: 'Nordic Dragon Games' }).where(eq(schema.organizations.id, s.advertiserId));

let seed = 42;
const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]!;
const DAY = 86_400_000;
const now = Date.now();
let user = 0;

for (let d = 29; d >= 0; d--) {
  // Volume grows over the month with weekly wobble.
  const clicksToday = Math.round(18 + (29 - d) * 1.6 + Math.sin(d / 1.3) * 6);
  for (let i = 0; i < clicksToday; i++) {
    user++;
    const uid = `demo-${user}`;
    const country = pick(['TR', 'TR', 'TR', 'DE', 'DE', 'FI']);
    const clickAt = new Date(now - d * DAY - rand() * 20 * 3_600_000);
    const click = await handleClick(db, {
      campaignId: s.campaignId, appKey: s.appKey, publisherUserId: uid, signature: sign(s.placementSecret, [s.campaignId, uid]),
      country, ip: `198.51.${user % 250}.${(user * 7) % 250}`, userAgent: 'demo', query: { sub1: 'wall' }, now: clickAt,
    });
    if (!click.ok || rand() > 0.62) continue; // not every click installs

    const post = (event: string, at: Date) =>
      handlePostback(db, { advertiserKey: s.postbackKey, query: { click_id: click.clickId, event }, url: '/seed', ip: null, now: at });

    const fast = rand() < 0.06; // a few injected installs, rejected by the CTIT rule
    const installAt = new Date(clickAt.getTime() + (fast ? 4_000 : 60_000 + rand() * 1_800_000));
    if (installAt.getTime() > now) continue;
    await post('install', installAt);
    if (fast || rand() > 0.38) continue;
    const levelAt = new Date(installAt.getTime() + (0.5 + rand() * 3) * DAY);
    if (levelAt.getTime() > now) continue;
    await post('af_level_achieved_10', levelAt);
    if (rand() > 0.3) continue;
    const buyAt = new Date(levelAt.getTime() + rand() * 4 * DAY);
    if (buyAt.getTime() < now) await post('af_purchase', buyAt);
  }
}

const password = process.env.DEV_ADVERTISER_PASSWORD || randomBytes(12).toString('base64url');
if (!process.env.DEV_ADVERTISER_PASSWORD) appendFileSync(new URL('../../../.env', import.meta.url), `DEV_ADVERTISER_EMAIL=${EMAIL}\nDEV_ADVERTISER_PASSWORD=${password}\n`);
await db.insert(schema.advertiserUsers).values({ id: `adu_demo_${randomBytes(4).toString('hex')}`, orgId: s.advertiserId, email: EMAIL, name: 'Aino Virtanen', passwordHash: await hashPassword(password) });
await pool.end();
console.log(`Demo advertiser ready. Log in at http://localhost:4200/login as ${EMAIL} (password in .env: DEV_ADVERTISER_PASSWORD).`);

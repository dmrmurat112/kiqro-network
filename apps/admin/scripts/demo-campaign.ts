/**
 * Sales-demo campaign: "Rise of Kingdoms" by an example advertiser, with 30 days of made-up
 * clicks, installs and level events so the panels look like a running campaign.
 *   node_modules/.bin/tsx apps/admin/scripts/demo-campaign.ts seed     (re-running replaces it)
 *   node_modules/.bin/tsx apps/admin/scripts/demo-campaign.ts remove   (deletes every trace)
 *
 * Everything lives under its own advertiser and publisher organizations (fixed ids below), so
 * real customers' numbers are untouched. The campaign is created by DEMO_SEED, which
 * acceptsNewUsers refuses: it is never offered to real users and accepts no clicks.
 */
import { randomBytes } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { createDb, getAccountId, newId, postTransaction, schema, type Tx } from '@kiqro/db';
import { DEMO_SEED } from '@kiqro/network';

const ADV = 'org_demo_rok_adv';
const PUB = 'org_demo_rok_pub';
const PRODUCT = 'prd_demo_rok';
const CAMPAIGN = 'cmp_demo_rok';
const PLACEMENT = 'plc_demo_rok';
const DAYS = 30;
const DAY_MS = 86_400_000;
/** Daily volume: a small, early-stage campaign (about $180 spend over the month). */
const VOLUME = 1 / 105;
const TARGET_SPEND = [175, 190] as const;
const SEED = 20261104;
const usd = (n: number) => BigInt(Math.round(n * 1_000_000));

/** Funnel: each step is reached by `rate` of the users who reached the step it follows. */
const TASKS = [
  {
    event: 'install',
    en: 'Install and open the game',
    tr: 'Oyunu yükle ve aç',
    days: 1,
    after: -1,
    rate: 0.41,
    delay: [0.002, 0.03],
    prices: { TR: 0.45, US: 1.2, '*': 0.9 },
  },
  {
    event: 'city_hall_10',
    en: 'Reach City Hall level 10',
    tr: 'Belediye Binası 10. seviyeye ulaş',
    days: 3,
    after: 0,
    rate: 0.62,
    delay: [0.3, 2.6],
    prices: { TR: 1.5, US: 3.6, '*': 3 },
  },
  {
    event: 'city_hall_15',
    en: 'Reach City Hall level 15',
    tr: 'Belediye Binası 15. seviyeye ulaş',
    days: 7,
    after: 1,
    rate: 0.53,
    delay: [0.8, 4.5],
    prices: { TR: 3.5, US: 8.5, '*': 7 },
  },
  {
    event: 'city_hall_17',
    en: 'Reach City Hall level 17',
    tr: 'Belediye Binası 17. seviyeye ulaş',
    days: 14,
    after: 2,
    rate: 0.57,
    delay: [1.5, 7],
    prices: { TR: 5, US: 12, '*': 10 },
  },
  {
    event: 'city_hall_20',
    en: 'Reach City Hall level 20',
    tr: 'Belediye Binası 20. seviyeye ulaş',
    days: 21,
    after: 3,
    rate: 0.46,
    delay: [2.5, 10],
    prices: { TR: 9, US: 22, '*': 18 },
  },
  {
    event: 'first_purchase',
    en: 'Make your first purchase',
    tr: 'İlk satın alımını yap',
    days: 30,
    after: 0,
    rate: 0.095,
    delay: [0.5, 25],
    prices: { TR: 5, US: 10, '*': 8 },
  },
] as const;

const COUNTRIES: [string, number][] = [
  ['TR', 0.32],
  ['DE', 0.14],
  ['US', 0.13],
  ['BR', 0.1],
  ['GB', 0.08],
  ['SA', 0.08],
  ['FR', 0.07],
  ['KR', 0.08],
];
const REVSHARE = 0.7;
const POINTS_PER_USD = 1000;

/** Deterministic randomness, so every run (local or production) shows the same numbers. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deletes the demo data; `everything` also removes the organizations and their panel logins. */
async function remove(tx: Tx, everything: boolean) {
  const orgs = [ADV, PUB];
  const users = (await tx.select({ id: schema.advertiserUsers.id }).from(schema.advertiserUsers).where(inArray(schema.advertiserUsers.orgId, orgs))).map((u) => u.id);
  const accounts = (await tx.select({ id: schema.ledgerAccounts.id }).from(schema.ledgerAccounts).where(inArray(schema.ledgerAccounts.orgId, orgs))).map((a) => a.id);
  // Every demo ledger transaction touches a demo account; remove those transactions whole,
  // including their legs on the shared revenue and cash accounts.
  const txns = accounts.length
    ? (await tx.selectDistinct({ id: schema.ledgerEntries.transactionId }).from(schema.ledgerEntries).where(inArray(schema.ledgerEntries.accountId, accounts))).map(
        (t) => t.id,
      )
    : [];

  await tx.delete(schema.claims).where(eq(schema.claims.campaignId, CAMPAIGN));
  await tx.execute(sql`delete from publisher_postbacks where conversion_id in (select id from conversions where campaign_id = ${CAMPAIGN})`);
  await tx.delete(schema.revenueEvents).where(eq(schema.revenueEvents.campaignId, CAMPAIGN));
  await tx.delete(schema.conversions).where(eq(schema.conversions.campaignId, CAMPAIGN));
  await tx.delete(schema.clicks).where(eq(schema.clicks.campaignId, CAMPAIGN));
  await tx.execute(sql`delete from task_payouts where task_id in (select id from campaign_tasks where campaign_id = ${CAMPAIGN})`);
  await tx.delete(schema.campaignTasks).where(eq(schema.campaignTasks.campaignId, CAMPAIGN));
  await tx.delete(schema.campaigns).where(inArray(schema.campaigns.orgId, orgs));
  await tx.delete(schema.products).where(inArray(schema.products.orgId, orgs));
  await tx.delete(schema.currencySales).where(eq(schema.currencySales.placementId, PLACEMENT));
  await tx.delete(schema.publisherUserBans).where(inArray(schema.publisherUserBans.publisherOrgId, orgs));
  await tx.delete(schema.placements).where(inArray(schema.placements.publisherOrgId, orgs));
  if (txns.length) {
    await tx.delete(schema.ledgerEntries).where(inArray(schema.ledgerEntries.transactionId, txns));
    await tx.delete(schema.ledgerTransactions).where(inArray(schema.ledgerTransactions.id, txns));
  }
  if (accounts.length) await tx.delete(schema.ledgerAccounts).where(inArray(schema.ledgerAccounts.id, accounts));
  await tx.execute(sql`delete from webhook_deliveries where endpoint_id in (select id from webhook_endpoints where org_id in (${ADV}, ${PUB}))`);
  await tx.delete(schema.webhookEndpoints).where(inArray(schema.webhookEndpoints.orgId, orgs));
  await tx.delete(schema.advertiserApiKeys).where(inArray(schema.advertiserApiKeys.orgId, orgs));
  await tx.delete(schema.payments).where(inArray(schema.payments.orgId, orgs));
  await tx.delete(schema.invoices).where(inArray(schema.invoices.orgId, orgs));
  if (!everything) return users.length;
  if (users.length) {
    await tx.delete(schema.advertiserSessions).where(inArray(schema.advertiserSessions.advertiserUserId, users));
    await tx.delete(schema.advertiserTokens).where(inArray(schema.advertiserTokens.advertiserUserId, users));
    await tx.delete(schema.advertiserUsers).where(inArray(schema.advertiserUsers.id, users));
  }
  await tx.delete(schema.organizations).where(inArray(schema.organizations.id, orgs));
  return users.length;
}

async function seed(tx: Tx, now: Date) {
  const start = new Date(now.getTime() - DAYS * DAY_MS);

  await tx
    .insert(schema.organizations)
    .values([
      {
        id: ADV,
        type: 'advertiser',
        name: 'Lilith Games',
        country: 'SG',
        status: 'active',
        postbackKey: `demo${randomBytes(8).toString('hex')}`,
        postbackSecret: randomBytes(24).toString('hex'),
        createdAt: new Date(start.getTime() - 4 * DAY_MS),
      },
      {
        id: PUB,
        type: 'publisher',
        name: 'Demo offerwall',
        country: 'TR',
        status: 'active',
        createdAt: new Date(start.getTime() - 4 * DAY_MS),
      },
    ])
    .onConflictDoNothing();
  await tx.insert(schema.placements).values({
    id: PLACEMENT,
    publisherOrgId: PUB,
    name: 'Demo offerwall',
    appKey: `demo_${randomBytes(12).toString('hex')}`,
    secret: randomBytes(24).toString('hex'),
    type: 'android',
    status: 'paused',
    currencyName: 'Coins',
    pointsPerUsd: String(POINTS_PER_USD),
    revshareBps: REVSHARE * 10_000,
  });
  await tx.insert(schema.products).values({
    id: PRODUCT,
    orgId: ADV,
    platform: 'android',
    storeId: 'com.lilithgame.roc.gp',
    name: 'Rise of Kingdoms',
    mmp: 'appsflyer',
    iconUrl: 'https://play-lh.googleusercontent.com/HuLwTL2y02yJyHASYTEEFbdBlcxk4RgmrUZxLBxIgLrffnSPyp12Wo6ax7KuZkwuFBwEvYSDnrrJHRnhtCS5=s512',
    createdAt: new Date(start.getTime() - 3 * DAY_MS),
  });
  await tx.insert(schema.campaigns).values({
    id: CAMPAIGN,
    orgId: ADV,
    productId: PRODUCT,
    name: 'Rise of Kingdoms — Global CPE',
    status: 'active',
    createdBy: DEMO_SEED,
    category: 'games',
    trackingUrl: 'https://app.appsflyer.com/com.lilithgame.roc.gp?pid=kiqronetwork_int&c=global_cpe&clickid={click_id}&advertising_id={gaid}',
    countries: COUNTRIES.map(([c]) => c),
    totalBudget: usd(1_000),
    dailyBudget: usd(50),
    startAt: start,
    attributionWindowDays: 7,
    title: { en: 'Rise of Kingdoms', tr: 'Rise of Kingdoms' },
    description: {
      en: 'Build your civilization and lead it to glory.',
      tr: 'Medeniyetini kur ve onu zafere taşı.',
    },
    instructions: {
      en: 'Install the game, play and upgrade your City Hall. Each level pays a reward.',
      tr: 'Oyunu yükle, oyna ve Belediye Binanı yükselt. Her seviye ödül kazandırır.',
    },
    submittedAt: new Date(start.getTime() - 2 * DAY_MS),
    reviewedAt: new Date(start.getTime() - DAY_MS),
    createdAt: new Date(start.getTime() - 3 * DAY_MS),
  });

  const taskIds = TASKS.map((_, i) => `tsk_demo_rok_${i + 1}`);
  await tx.insert(schema.campaignTasks).values(
    TASKS.map((t, i) => ({
      id: taskIds[i]!,
      campaignId: CAMPAIGN,
      seq: i + 1,
      mmpEventName: t.event,
      timeLimitDays: t.days,
      displayName: { en: t.en, tr: t.tr },
    })),
  );
  await tx.insert(schema.taskPayouts).values(
    TASKS.flatMap((t, i) =>
      Object.entries(t.prices).map(([country, p]) => ({
        id: newId('payout'),
        taskId: taskIds[i]!,
        country,
        price: usd(p),
      })),
    ),
  );
  const price = (i: number, country: string) => {
    const p = TASKS[i]!.prices as Record<string, number>;
    return p[country] ?? p['*']!;
  };

  /** One possible month of traffic; the same seed always gives the same month. */
  const generate = (seed: number) => {
    const rand = rng(seed);
    const between = (a: number, b: number) => a + (b - a) * rand();
    const pick = () => {
      let r = rand();
      for (const [c, w] of COUNTRIES) if ((r -= w) <= 0) return c;
      return COUNTRIES[0]![0];
    };
    const clickRows: (typeof schema.clicks.$inferInsert)[] = [];
    const convRows: (typeof schema.conversions.$inferInsert)[] = [];
    let user = 0;
    for (let d = 0; d < DAYS; d++) {
      const dayStart = start.getTime() + d * DAY_MS;
      const weekend = [0, 6].includes(new Date(dayStart).getUTCDay());
      // Ramps up over the month, busier at weekends.
      const n = Math.floor((240 + d * 6.5) * (weekend ? 1.16 : 1) * between(0.9, 1.1) * VOLUME + rand());
      for (let k = 0; k < n; k++) {
        const at = new Date(dayStart + rand() * DAY_MS);
        if (at > now) continue;
        const id = newId('click');
        const country = pick();
        const userId = `demo_u_${++user}`;
        clickRows.push({
          id,
          campaignId: CAMPAIGN,
          placementId: PLACEMENT,
          publisherUserId: userId,
          country,
          publisherRisk: Math.floor(rand() * 18),
          createdAt: at,
          userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
        });

        const reachedAt: (Date | null)[] = [];
        TASKS.forEach((t, i) => {
          const prev = t.after < 0 ? at : reachedAt[t.after];
          if (!prev || rand() >= t.rate) return void (reachedAt[i] = null);
          const eventAt = new Date(prev.getTime() + between(t.delay[0], t.delay[1]) * DAY_MS);
          if (eventAt > now) return void (reachedAt[i] = null);
          reachedAt[i] = eventAt;
          // A few events are stopped by fraud checks (more of them at install).
          const r = rand();
          const status = r < (i === 0 ? 0.035 : 0.012) ? 'rejected' : r < (i === 0 ? 0.05 : 0.02) ? 'held' : 'approved';
          const reasons = status === 'approved' ? [] : [(['ip_risky', 'ip_install_cluster', 'user_velocity'] as const)[Math.floor(rand() * 3)]!];
          const adv = usd(price(i, country));
          const pub = (adv * BigInt(REVSHARE * 10_000)) / 10_000n;
          convRows.push({
            id: newId('conversion'),
            clickId: id,
            taskId: taskIds[i]!,
            campaignId: CAMPAIGN,
            placementId: PLACEMENT,
            publisherUserId: userId,
            status,
            reasons,
            advertiserPrice: adv,
            publisherPayout: pub,
            userRewardPoints: (pub * BigInt(POINTS_PER_USD)) / 1_000_000n,
            eventAt,
            createdAt: eventAt,
          });
          if (status !== 'approved') reachedAt[i] = null;
        });
      }
    }
    return { clickRows, convRows };
  };

  // Small volumes are noisy: take the first month whose spend lands in the target range and
  // that reaches every level at least once.
  let month = generate(SEED);
  for (let seed = SEED + 1; seed < SEED + 500; seed++) {
    const ok = month.convRows.filter((c) => c.status === 'approved');
    const spent = Number(ok.reduce((sum, c) => sum + c.advertiserPrice, 0n)) / 1e6;
    if (spent >= TARGET_SPEND[0] && spent <= TARGET_SPEND[1] && taskIds.every((t) => ok.some((c) => c.taskId === t))) break;
    month = generate(seed);
  }
  const { clickRows, convRows } = month;
  for (let i = 0; i < clickRows.length; i += 1000) await tx.insert(schema.clicks).values(clickRows.slice(i, i + 1000));
  for (let i = 0; i < convRows.length; i += 1000) await tx.insert(schema.conversions).values(convRows.slice(i, i + 1000));

  // Ledger: the prepaid top-up and the approved spend, so balance and finance views agree.
  const approved = convRows.filter((c) => c.status === 'approved');
  const spend = approved.reduce((s, c) => s + c.advertiserPrice, 0n);
  const payout = approved.reduce((s, c) => s + c.publisherPayout, 0n);
  const balance = await getAccountId(tx, 'advertiser_balance', ADV);
  const cash = await getAccountId(tx, 'external_cash', null);
  for (const amount of [usd(500)]) {
    await postTransaction(tx, {
      type: 'advertiser_topup',
      refType: 'organization',
      refId: ADV,
      memo: 'Demo',
      entries: [
        { accountId: cash, amount: -amount },
        { accountId: balance, amount },
      ],
    });
  }
  await postTransaction(tx, {
    type: 'conversion',
    refType: 'campaign',
    refId: CAMPAIGN,
    memo: 'Demo campaign spend',
    entries: [
      { accountId: balance, amount: -spend },
      {
        accountId: await getAccountId(tx, 'publisher_payable', PUB),
        amount: payout,
      },
      {
        accountId: await getAccountId(tx, 'kiqro_revenue', null),
        amount: spend - payout,
      },
    ],
  });

  const count = (i: number) => approved.filter((c) => c.taskId === taskIds[i]).length;
  return {
    clicks: clickRows.length,
    conversions: convRows.length,
    spend,
    funnel: TASKS.map((t, i) => `${t.event}: ${count(i)}`),
  };
}

const command = process.argv[2];
if (command !== 'seed' && command !== 'remove') {
  console.error('Kullanım: demo-campaign.ts seed | remove');
  process.exit(1);
}
const { db, pool } = createDb();
try {
  await db.transaction(async (tx) => {
    // Re-seeding keeps the demo organizations and the panel logins invited to them.
    const users = await remove(tx, command === 'remove');
    if (command === 'remove') {
      console.log(`Demo kampanya silindi${users ? ` (${users} panel kullanıcısıyla birlikte)` : ''}.`);
      return;
    }
    const r = await seed(tx, new Date());
    console.log(`Demo kampanya oluşturuldu: ${r.clicks} tıklama, ${r.conversions} olay, harcama $${(Number(r.spend) / 1e6).toFixed(2)}`);
    console.log(r.funnel.join(' · '));
  });
} finally {
  await pool.end();
}

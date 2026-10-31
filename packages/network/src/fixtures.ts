import { randomBytes } from 'node:crypto';
import { parseMicros } from '@kiqro/core';
import { newId, schema, topUpAdvertiser, type Db } from '@kiqro/db';

const { campaignTasks, campaigns, organizations, placements, products, taskPayouts } = schema;

const secret = () => randomBytes(24).toString('hex');

export interface DemoSetup {
  advertiserId: string;
  postbackKey: string;
  campaignId: string;
  publisherId: string;
  appKey: string;
  placementSecret: string;
}

export interface DemoOptions {
  topUpUsd?: string;
  revshareBps?: number;
  pointsPerUsd?: string;
  postbackUrl?: string | null;
  advertiserPostbackSecret?: string | null;
  totalBudgetUsd?: string;
}

/**
 * Creates one advertiser with a three-step CPE campaign (install → level 10 → purchase),
 * the Kiqro app as publisher with one placement, and a prepaid balance.
 * Used by the dev seed script and the integration tests.
 */
export async function createDemoSetup(db: Db, opts: DemoOptions = {}): Promise<DemoSetup> {
  const advertiserId = newId('org');
  const postbackKey = `adv_${randomBytes(8).toString('hex')}`;
  await db.insert(organizations).values({
    id: advertiserId,
    type: 'advertiser',
    name: 'Dragon Realm Games',
    country: 'FI',
    status: 'active',
    postbackKey,
    postbackSecret: opts.advertiserPostbackSecret ?? null,
  });

  const productId = newId('product');
  await db.insert(products).values({ id: productId, orgId: advertiserId, platform: 'android', storeId: 'com.dragon.realm', name: 'Dragon Realm', mmp: 'appsflyer' });

  const campaignId = newId('campaign');
  await db.insert(campaigns).values({
    id: campaignId,
    orgId: advertiserId,
    productId,
    name: 'Dragon Realm – DE/FI/TR CPE',
    status: 'active',
    trackingUrl: 'https://app.appsflyer.com/com.dragon.realm?pid=kiqro_int&clickid={click_id}&af_siteid={source_id}&af_sub1={sub_source}&advertising_id={gaid}',
    countries: ['DE', 'FI', 'TR'],
    totalBudget: parseMicros(opts.totalBudgetUsd ?? '5000'),
    title: { en: 'Dragon Realm', tr: 'Dragon Realm', fi: 'Dragon Realm' },
    description: { en: 'Install and reach the milestones within the time limit.' },
  });

  const tasks = [
    { seq: 1, event: 'install', days: 1, name: { en: 'Install and open', tr: 'Yükle ve aç' }, prices: { '*': '0.40' } },
    { seq: 2, event: 'af_level_achieved_10', days: 7, name: { en: 'Reach level 10', tr: '10. seviyeye ulaş' }, prices: { '*': '2.20', DE: '3.00' } },
    { seq: 3, event: 'af_purchase', days: 14, name: { en: 'Make a purchase', tr: 'Satın alma yap' }, prices: { '*': '6.00' } },
  ];
  for (const t of tasks) {
    const taskId = newId('task');
    await db.insert(campaignTasks).values({ id: taskId, campaignId, seq: t.seq, mmpEventName: t.event, timeLimitDays: t.days, displayName: t.name });
    await db.insert(taskPayouts).values(Object.entries(t.prices).map(([country, price]) => ({ id: newId('payout'), taskId, country, price: parseMicros(price) })));
  }

  const publisherId = newId('org');
  await db.insert(organizations).values({ id: publisherId, type: 'publisher', name: 'Kiqro App', country: 'TR', status: 'active' });
  const appKey = `app_${randomBytes(8).toString('hex')}`;
  const placementSecret = secret();
  await db.insert(placements).values({
    id: newId('placement'),
    publisherOrgId: publisherId,
    name: 'Kiqro app – Kiqro Direct',
    appKey,
    secret: placementSecret,
    currencyName: 'Kiqro Puan',
    pointsPerUsd: opts.pointsPerUsd ?? '1000',
    revshareBps: opts.revshareBps ?? 7_000,
    postbackUrl: opts.postbackUrl === undefined ? 'https://api.kiqro.example/callbacks/kiqro-direct?uid={user_id}&amount={amount}&tx={transaction_id}&status={status}&sig={signature}' : opts.postbackUrl,
  });

  await topUpAdvertiser(db, advertiserId, parseMicros(opts.topUpUsd ?? '1000'), 'demo top-up');
  return { advertiserId, postbackKey, campaignId, publisherId, appKey, placementSecret };
}

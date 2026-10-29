import { sign } from '@kiqro/core';
import { createDb } from '@kiqro/db';
import { createDemoSetup } from './fixtures.ts';

const { db, pool } = createDb();
const setup = await createDemoSetup(db);
await pool.end();

const base = process.env.TRACKING_BASE_URL ?? 'http://localhost:4000';
const userId = 'demo-user-1';
const offersSig = sign(setup.placementSecret, [setup.appKey, userId]);
const clickSig = sign(setup.placementSecret, [setup.campaignId, userId]);

console.log('Demo data created:\n', setup);
console.log(`\nOffers:   ${base}/v1/offers?app_key=${setup.appKey}&user_id=${userId}&country=TR&lang=tr&sig=${offersSig}`);
console.log(`Click:    ${base}/c/${setup.campaignId}?app_key=${setup.appKey}&uid=${userId}&sig=${clickSig}   (send header CF-IPCountry: TR)`);
console.log(`Postback: ${base}/v1/mmp/${setup.postbackKey}?click_id=<click_id>&event=install`);

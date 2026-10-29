import { setTimeout as sleep } from 'node:timers/promises';
import { createDb } from '@kiqro/db';
import { deliverDuePostbacks } from './outbox.ts';

const POLL_INTERVAL_MS = 2_000;

const { db, pool } = createDb();
let running = true;
process.on('SIGINT', () => (running = false));
process.on('SIGTERM', () => (running = false));

console.log('publisher postback worker started');
while (running) {
  try {
    const attempted = await deliverDuePostbacks(db);
    if (attempted > 0) console.log(`attempted ${attempted} publisher postbacks`);
    if (attempted === 0) await sleep(POLL_INTERVAL_MS);
  } catch (e) {
    console.error('postback delivery failed', e);
    await sleep(POLL_INTERVAL_MS);
  }
}
await pool.end();

import { setTimeout as sleep } from 'node:timers/promises';
import { createDb } from '@kiqro/db';
import { backfillProductIcons, deliverDueEmails, deliverDuePostbacks, issueMonthlyInvoices, mailerFromEnv, remindOverdueInvoices } from '@kiqro/network';
import { checkLowBalances } from '@kiqro/network/advertiser';

const POLL_INTERVAL_MS = 2_000;
const BALANCE_CHECK_INTERVAL_MS = 10 * 60_000;
const ICON_BACKFILL_INTERVAL_MS = 60 * 60_000;

const { db, pool } = createDb();
const mailer = mailerFromEnv();
const links = { advertiseBaseUrl: process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200' };
let running = true;
let lastBalanceCheck = 0;
let lastIconBackfill = 0;
// Apps whose store lookup failed; cleared hourly so they are retried now and then.
const iconMisses = new Set<string>();
process.on('SIGINT', () => (running = false));
process.on('SIGTERM', () => (running = false));

if (!process.env.SENDGRID_API_KEY) console.warn('SENDGRID_API_KEY is not set: e-mails are printed to this console instead of being sent');
console.log('worker started: publisher postbacks, e-mail, low-balance alerts, invoices');

while (running) {
  try {
    const postbacks = await deliverDuePostbacks(db);
    const emails = await deliverDueEmails(db, mailer);
    if (Date.now() - lastBalanceCheck > BALANCE_CHECK_INTERVAL_MS) {
      lastBalanceCheck = Date.now();
      const alerted = await checkLowBalances(db, links);
      if (alerted) console.log(`low-balance alerts queued for ${alerted} advertisers`);
      const issued = await issueMonthlyInvoices(db, links);
      if (issued) console.log(`invoices issued: ${issued}`);
      const reminded = await remindOverdueInvoices(db, links);
      if (reminded) console.log(`overdue invoice reminders queued: ${reminded}`);
    }
    if (Date.now() - lastIconBackfill > ICON_BACKFILL_INTERVAL_MS) {
      lastIconBackfill = Date.now();
      iconMisses.clear();
      const filled = await backfillProductIcons(db, { skip: iconMisses });
      if (filled) console.log(`app icons filled in: ${filled}`);
    }
    if (postbacks || emails) console.log(`delivered: ${postbacks} postbacks, ${emails} e-mails`);
    if (postbacks === 0 && emails === 0) await sleep(POLL_INTERVAL_MS);
  } catch (e) {
    console.error('worker iteration failed', e);
    await sleep(POLL_INTERVAL_MS);
  }
}
await pool.end();

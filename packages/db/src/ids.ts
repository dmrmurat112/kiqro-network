import { ulid } from 'ulid';

const prefixes = {
  org: 'org',
  product: 'prd',
  campaign: 'cmp',
  task: 'tsk',
  payout: 'tpo',
  placement: 'plc',
  click: 'clk',
  postback: 'pbr',
  conversion: 'cnv',
  account: 'acc',
  transaction: 'txn',
  entry: 'ent',
  outbox: 'pbo',
  admin: 'adm',
  audit: 'aud',
  loginAttempt: 'lga',
  advertiserUser: 'adu',
  lead: 'led',
  email: 'eml',
  payment: 'pay',
  invoice: 'inv',
  claim: 'clm',
  apiKey: 'key',
  webhook: 'whe',
  delivery: 'whd',
} as const;

/** Prefixed, time-sortable ids, e.g. "cnv_01JBX…". The prefix makes ids self-describing in logs. */
export function newId(kind: keyof typeof prefixes): string {
  return `${prefixes[kind]}_${ulid()}`;
}

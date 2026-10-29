import { getAccountId, getBalance, type Db } from '@kiqro/db';
import { buildServer } from '../src/server.ts';

export { resetTestDb as resetDb, setupTestDb as setupDb } from '@kiqro/db/testing';

export const TRACKING_BASE = 'https://track.test';

export function server(db: Db) {
  return buildServer({ db, trackingBaseUrl: TRACKING_BASE });
}

export async function balanceOf(db: Db, kind: 'advertiser_balance' | 'publisher_payable' | 'kiqro_revenue', orgId: string | null): Promise<bigint> {
  return getBalance(db, await getAccountId(db, kind, orgId));
}

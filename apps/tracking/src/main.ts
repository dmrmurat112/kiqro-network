import { createDb } from '@kiqro/db';
import { defaultFraudConfig, ipIntelFromEnv } from '@kiqro/network';
import { buildServer } from './server.ts';

const { db, pool } = createDb();
const port = Number(process.env.PORT ?? 4000);
const fraud = { intel: ipIntelFromEnv(), config: defaultFraudConfig };
if (!process.env.IPQS_API_KEY) console.warn('IPQS_API_KEY is not set: VPN/proxy detection is off');
const app = buildServer({ db, fraud, originSecret: process.env.ORIGIN_SECRET || undefined, trackingBaseUrl: process.env.TRACKING_BASE_URL ?? `http://localhost:${port}`, logger: true });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host: '0.0.0.0' });

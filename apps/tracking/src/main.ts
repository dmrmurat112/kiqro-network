import { createDb } from '@kiqro/db';
import { buildServer } from './server.ts';

const { db, pool } = createDb();
const port = Number(process.env.PORT ?? 4000);
const app = buildServer({ db, trackingBaseUrl: process.env.TRACKING_BASE_URL ?? `http://localhost:${port}`, logger: true });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host: '0.0.0.0' });

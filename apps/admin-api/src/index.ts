import { buildAdminApp } from './app.js';
import { loadEnv } from './config/env.js';
import { getPool, closePool } from './db/pool.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const pool = getPool();

  const app = await buildAdminApp({ pool });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.ADMIN_PORT, host: env.ADMIN_HOST });
    app.log.info(
      `emotion-companion admin-api listening on http://${env.ADMIN_HOST}:${env.ADMIN_PORT}`
    );
  } catch (err) {
    app.log.error(err);
    await closePool();
    process.exit(1);
  }
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal admin bootstrap error:', err);
  process.exit(1);
});

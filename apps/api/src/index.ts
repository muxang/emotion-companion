import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await app.register(cors, {
    origin: CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(healthRoutes, { prefix: '/api' });

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`emotion-companion api listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});

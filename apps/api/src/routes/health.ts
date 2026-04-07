import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    success: true,
    data: {
      status: 'ok',
      service: 'emotion-companion-api',
      timestamp: new Date().toISOString(),
    },
  }));
}

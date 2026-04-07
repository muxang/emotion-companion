import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../config/env.js';

/**
 * 注册 @fastify/jwt 与 requireAuth preHandler。
 */
async function jwtPlugin(app: FastifyInstance): Promise<void> {
  const env = loadEnv();

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate('requireAuth', async (request, reply) => {
    try {
      await request.jwtVerify();
      const payload = request.user;
      if (!payload?.sub) {
        throw new Error('missing sub claim');
      }
      request.userId = payload.sub;
    } catch {
      reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '未登录或登录已过期' },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

export default fp(jwtPlugin, { name: 'jwt-plugin' });

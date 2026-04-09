import type { FastifyReply, FastifyRequest } from 'fastify';
import { loadEnv } from '../config/env.js';

/**
 * Admin Token 鉴权中间件。
 * 校验请求头 `x-admin-token` 是否与 ADMIN_TOKEN 一致。
 * 不匹配返回 401，符合统一错误格式（CLAUDE.md §12.2）。
 */
export async function adminAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const env = loadEnv();
  const header = request.headers['x-admin-token'];
  const token = Array.isArray(header) ? header[0] : header;

  if (!token || token !== env.ADMIN_TOKEN) {
    await reply.code(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing admin token',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

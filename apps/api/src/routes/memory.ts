/**
 * Memory routes - Phase 5
 *
 * - GET  /memory/timeline   返回最近 10 条关键事件
 * - POST /memory/delete     删除 / 匿名化用户全部长期记忆（CLAUDE.md §14.3）
 *
 * 全部接口受 requireAuth 保护。
 */
import type { FastifyInstance } from 'fastify';
import { ok, fail } from '../utils/response.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAuth);

  app.get('/memory/timeline', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const events = await app.repos.memory.getRelationshipEvents(userId, 10);
    return reply.send(ok({ events }));
  });

  app.post('/memory/delete', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const result = await app.repos.memory.deleteOrAnonymizeUserMemory(userId);
    request.log.info(
      { userId, ...result },
      'memory.delete: anonymized/deleted user long-term memory'
    );
    app.tracker.track('memory_deleted', { ...result }, userId);
    return reply.send(ok({ deleted: result }));
  });
}

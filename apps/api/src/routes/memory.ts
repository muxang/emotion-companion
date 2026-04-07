/**
 * Memory routes - Phase 5 / Phase 7
 *
 * - GET  /memory/timeline   返回成长 feed：events / entities / summaries 三类
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
    // 同时取三类成长信号，前端按需渲染：
    //  - events    : AI 抽出的"具体事件"（最稀疏，需要明确事件描述）
    //  - entities  : AI 抽出的"关系对象"（次稀疏）
    //  - summaries : 每会话生成的对话摘要（最稠密，普通聊天即可产生）
    const [events, entities, summaries] = await Promise.all([
      app.repos.memory.getRelationshipEvents(userId, 10),
      app.repos.memory.getRelationshipEntities(userId),
      app.repos.memory.getMemorySummaries(userId, undefined, 10),
    ]);
    return reply.send(ok({ events, entities, summaries }));
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

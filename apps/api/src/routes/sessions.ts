import type { FastifyInstance } from 'fastify';
import {
  CreateSessionSchema,
  SessionIdParamSchema,
} from '@emotion/shared';
import { ok, fail } from '../utils/response.js';

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // 全部受 requireAuth 保护
  app.addHook('preHandler', app.requireAuth);

  app.get('/sessions', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const sessions = await app.repos.sessions.listByUser(userId);
    return reply.send(ok({ sessions }));
  });

  app.post('/sessions', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const parsed = CreateSessionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(
        fail('VALIDATION_ERROR', '会话参数校验失败', {
          issues: parsed.error.issues,
        })
      );
    }
    const session = await app.repos.sessions.create({
      user_id: userId,
      title: parsed.data.title,
      mode: parsed.data.mode,
    });
    return reply.code(201).send(ok({ session }));
  });

  app.get('/sessions/:id', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const params = SessionIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .code(422)
        .send(fail('VALIDATION_ERROR', 'session id 不合法'));
    }
    const session = await app.repos.sessions.findById(params.data.id);
    if (!session) {
      return reply.code(404).send(fail('NOT_FOUND', '会话不存在'));
    }
    if (session.user_id !== userId) {
      return reply.code(403).send(fail('FORBIDDEN', '无权访问该会话'));
    }
    const messages = await app.repos.messages.listBySession(session.id);
    return reply.send(ok({ session, messages }));
  });

  app.delete('/sessions/:id', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const params = SessionIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .code(422)
        .send(fail('VALIDATION_ERROR', 'session id 不合法'));
    }
    const deleted = await app.repos.sessions.delete(params.data.id, userId);
    if (!deleted) {
      return reply.code(404).send(fail('NOT_FOUND', '会话不存在或无权删除'));
    }
    return reply.send(ok({ deleted: true }));
  });
}

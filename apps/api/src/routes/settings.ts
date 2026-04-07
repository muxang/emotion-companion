/**
 * Settings routes - Phase 5
 *
 * - GET /api/settings   返回当前用户的偏好（tone_preference / memory_enabled）
 * - PUT /api/settings   局部更新偏好
 *
 * 全部接口受 requireAuth 保护。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';

const UpdateSettingsSchema = z
  .object({
    tone_preference: z.enum(['warm', 'rational', 'direct']).optional(),
    memory_enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.tone_preference !== undefined || v.memory_enabled !== undefined,
    { message: '至少需要传入 tone_preference 或 memory_enabled 中的一个字段' }
  );

interface SettingsView {
  tone_preference: 'warm' | 'rational' | 'direct';
  memory_enabled: boolean;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAuth);

  app.get('/settings', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const user = await app.repos.users.findById(userId);
    if (!user) {
      return reply.code(404).send(fail('NOT_FOUND', '用户不存在'));
    }
    const view: SettingsView = {
      tone_preference: user.tone_preference,
      memory_enabled: user.memory_enabled,
    };
    return reply.send(ok({ settings: view }));
  });

  app.put('/settings', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const parsed = UpdateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send(
        fail('VALIDATION_ERROR', '设置参数校验失败', {
          issues: parsed.error.issues,
        })
      );
    }
    const updated = await app.repos.users.updateSettings(userId, parsed.data);
    if (!updated) {
      return reply.code(404).send(fail('NOT_FOUND', '用户不存在'));
    }
    request.log.info(
      {
        userId,
        tone_preference: parsed.data.tone_preference,
        memory_enabled: parsed.data.memory_enabled,
      },
      'settings.update'
    );
    const view: SettingsView = {
      tone_preference: updated.tone_preference,
      memory_enabled: updated.memory_enabled,
    };
    return reply.send(ok({ settings: view }));
  });
}

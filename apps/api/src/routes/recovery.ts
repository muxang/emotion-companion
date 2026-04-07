import type { FastifyInstance } from 'fastify';
import {
  CreateRecoveryPlanSchema,
  RecoveryCheckinSchema,
  RecoveryPlanIdParamSchema,
  type RecoveryTask,
} from '@emotion/shared';
import {
  BlockedByRiskError,
  makeSafeDefaultTask,
  runRecoveryPlan,
} from '@emotion/skill-recovery-plan';
import { ok, fail } from '../utils/response.js';

/**
 * Phase 6: 恢复计划路由（CLAUDE.md §12.1）。
 *
 * - GET    /api/recovery-plans         列出当前用户的全部计划
 * - POST   /api/recovery-plans         创建计划（plan_type 决定 total_days）
 * - GET    /api/recovery-plans/:id     计划详情：含今日任务（runRecoveryPlan）+ 打卡列表
 * - POST   /api/recovery-plans/:id/checkin  完成今日打卡，推进 current_day
 *
 * 全部 requireAuth；所有 :id 路由必须先 getPlanById(id, userId) 校验归属。
 */
export async function recoveryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAuth);

  // GET /recovery-plans
  app.get('/recovery-plans', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const plans = await app.repos.recovery.listPlansByUser(userId);
    return reply.send(ok({ plans }));
  });

  // POST /recovery-plans
  app.post('/recovery-plans', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const parsed = CreateRecoveryPlanSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send(
        fail('VALIDATION_ERROR', '计划参数校验失败', {
          issues: parsed.error.issues,
        })
      );
    }
    const plan = await app.repos.recovery.createPlan(
      userId,
      parsed.data.plan_type
    );
    return reply.code(201).send(ok({ plan }));
  });

  // GET /recovery-plans/:id  —— 详情：含今日任务 + checkins
  app.get('/recovery-plans/:id', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const params = RecoveryPlanIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .code(422)
        .send(fail('VALIDATION_ERROR', 'plan id 不合法'));
    }

    const plan = await app.repos.recovery.getPlanById(params.data.id, userId);
    if (!plan) {
      return reply.code(404).send(fail('NOT_FOUND', '恢复计划不存在'));
    }

    const checkins = await app.repos.recovery.listCheckinsByPlan(plan.id);

    // 今日任务：仅在 active 时尝试生成；completed/paused 不再生成
    let todayTask: RecoveryTask | null = null;
    if (plan.status === 'active') {
      try {
        todayTask = await runRecoveryPlan(
          {
            plan_type: plan.plan_type,
            day_index: plan.current_day,
          },
          { ai: app.aiClient, risk_level: 'low' }
        );
      } catch (err) {
        if (err instanceof BlockedByRiskError) {
          // 第二道防线：理论上详情接口不会传 critical，但保险起见走兜底
          request.log.warn(
            { userId, plan_id: plan.id },
            'recovery-plan blocked by risk gate, using safe default'
          );
          todayTask = makeSafeDefaultTask(plan.current_day);
        } else {
          request.log.warn(
            { err, userId, plan_id: plan.id },
            'runRecoveryPlan failed, using safe default'
          );
          todayTask = makeSafeDefaultTask(plan.current_day);
        }
      }
    }

    return reply.send(
      ok({
        plan,
        checkins,
        today_task: todayTask,
      })
    );
  });

  // POST /recovery-plans/:id/checkin
  app.post('/recovery-plans/:id/checkin', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    const params = RecoveryPlanIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .code(422)
        .send(fail('VALIDATION_ERROR', 'plan id 不合法'));
    }
    const bodyParsed = RecoveryCheckinSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      return reply.code(422).send(
        fail('VALIDATION_ERROR', '打卡参数校验失败', {
          issues: bodyParsed.error.issues,
        })
      );
    }

    // 先确认归属
    const plan = await app.repos.recovery.getPlanById(params.data.id, userId);
    if (!plan) {
      return reply.code(404).send(fail('NOT_FOUND', '恢复计划不存在'));
    }
    if (plan.status !== 'active') {
      return reply
        .code(409)
        .send(
          fail('PLAN_NOT_ACTIVE', '该计划当前不可打卡（已完成或已暂停）')
        );
    }

    // day_index 由后端决定（plan.current_day），不接受前端传入，防止越权打其他天
    const dayIndex = plan.current_day;

    const result = await app.repos.recovery.completeCheckin(
      plan.id,
      userId,
      dayIndex,
      bodyParsed.data.reflection ?? null,
      bodyParsed.data.mood_score ?? null
    );
    if (!result) {
      return reply.code(404).send(fail('NOT_FOUND', '恢复计划不存在'));
    }

    // 幂等：当日已打卡，返回 409
    if (result.already_done) {
      request.log.info(
        { userId, plan_id: plan.id, day_index: dayIndex },
        'recovery checkin: already done, returning 409'
      );
      return reply.code(409).send(
        fail('ALREADY_CHECKED_IN', '今日已打卡', {
          day_index: dayIndex,
          checkin: result.checkin,
        })
      );
    }

    return reply.send(
      ok({
        checkin: result.checkin,
        plan: result.plan,
      })
    );
  });
}

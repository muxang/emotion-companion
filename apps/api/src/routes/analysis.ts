import type { FastifyInstance } from 'fastify';
import {
  AnalysisRequestSchema,
  RiskLevelSchema,
  type AnalysisResult,
  type RiskLevel,
} from '@emotion/shared';
import {
  runTongAnalysis,
  BlockedByRiskError,
} from '@emotion/skill-tong-analysis';
import { ok, fail } from '../utils/response.js';
import { extractAnalysisInput } from '../services/extractAnalysisInput.js';

/**
 * POST /api/analysis/relationship
 *
 * 关系分析独立入口（CLAUDE.md §12.1）。
 *
 * - Bearer 鉴权
 * - 输入：{ user_text }，自然语言一段话
 *   后端先调 extractAnalysisInput 抽取出 TongAnalysisInput，
 *   再交给 runTongAnalysis。
 * - risk_level：从 query ?risk_level=low|medium 取，默认 'low'
 *   high/critical 会被 skill 内部 BlockedByRiskError 拦截，返回 403
 * - 输出：ApiSuccess<{ analysis: AnalysisResult }>
 *
 * 注意：这条路由不会经过 orchestrator，由前端表单上下文决定 risk_level。
 */
export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAuth);

  app.post('/analysis/relationship', {
    // Phase 7：关系分析算力开销高，10 次/分钟
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }

    // 1. 校验 body —— 只接受 { user_text }
    const inputParsed = AnalysisRequestSchema.safeParse(request.body);
    if (!inputParsed.success) {
      return reply.code(422).send(
        fail('VALIDATION_ERROR', '请输入 10~1000 字的描述', {
          issues: inputParsed.error.issues,
        })
      );
    }

    // 2. 解析 risk_level（query 优先，默认 'low'）
    const queryRisk = (request.query as { risk_level?: unknown } | undefined)
      ?.risk_level;
    let risk_level: RiskLevel = 'low';
    if (typeof queryRisk === 'string') {
      const r = RiskLevelSchema.safeParse(queryRisk);
      if (!r.success) {
        return reply
          .code(422)
          .send(fail('VALIDATION_ERROR', 'risk_level 不合法'));
      }
      risk_level = r.data;
    }

    // Phase 7：埋点（不含用户原文）
    app.tracker.track(
      'analysis_requested',
      {
        risk_level,
        text_length: inputParsed.data.user_text.length,
      },
      userId
    );

    // 3. 抽取结构化字段（失败走安全降级，永不抛错）
    const extracted = await extractAnalysisInput(inputParsed.data.user_text, {
      ai: app.aiClient,
    });

    // 4. 调用 wrapper
    let result: AnalysisResult;
    try {
      result = await runTongAnalysis(extracted, {
        ai: app.aiClient,
        risk_level,
      });
    } catch (err) {
      if (err instanceof BlockedByRiskError) {
        request.log.warn(
          { userId, risk_level: err.risk_level },
          'tong-analysis blocked by risk gate'
        );
        return reply.code(403).send(
          fail(
            err.code,
            '当前风险等级下不支持关系分析，请先寻求陪伴或现实支持',
            { risk_level: err.risk_level }
          )
        );
      }
      request.log.error(
        { err, userId },
        'analysis/relationship unexpected error'
      );
      return reply
        .code(500)
        .send(fail('INTERNAL_ERROR', '关系分析暂时不可用，请稍后再试'));
    }

    return reply.send(ok({ analysis: result }));
  });
}

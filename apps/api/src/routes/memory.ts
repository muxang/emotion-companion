/**
 * Memory routes - Phase 5 / Phase 7
 *
 * - GET  /memory/timeline   返回成长 feed：events / entities / summaries 三类
 * - POST /memory/delete     删除 / 匿名化用户全部长期记忆（CLAUDE.md §14.3）
 *
 * 全部接口受 requireAuth 保护。
 */
import type { FastifyInstance } from 'fastify';
import { analyzeUserPatterns, getEmotionTrend, trendSummaryMessage, type PatternDebugLog } from '@emotion/memory';
import { getPool } from '../db/pool.js';
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

  // ---- 情绪趋势 ----
  app.get('/memory/emotion-trend', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }
    try {
      const trend = await getEmotionTrend(getPool(), userId, 7);
      const message = trendSummaryMessage(trend);
      return reply.send(ok({ trend, message }));
    } catch (err) {
      request.log.warn({ err }, 'emotion-trend query failed');
      return reply.send(ok({ trend: null, message: trendSummaryMessage(null) }));
    }
  });

  // ---- 隐性模式发现器（AI 动态生成版）----
  app.get('/memory/patterns', async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send(fail('UNAUTHORIZED', '未登录'));
    }

    const pool = getPool();

    // 24 小时缓存：先查是否有近期缓存
    try {
      const cacheRes = await pool.query<{ structured_json: Record<string, unknown> }>(
        `SELECT m.structured_json FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE s.user_id = $1
           AND m.structured_json->>'_patterns_cache' IS NOT NULL
           AND m.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY m.created_at DESC LIMIT 1`,
        [userId]
      );
      const cached = cacheRes.rows[0]?.structured_json;
      if (cached && cached._patterns_cache) {
        const cachedData = cached._patterns_cache as Record<string, unknown>;
        const cachedPatterns = Array.isArray(cachedData.patterns)
          ? cachedData.patterns
          : [];
        // 缓存为空数组时不用缓存——用户可能刚聊了更多内容，需要重新分析
        if (cachedPatterns.length > 0) {
          request.log.info(
            { step: 'patterns-cache-hit', userId, count: cachedPatterns.length },
            'patterns: returning cached result'
          );
          return reply.send(
            ok({ ...cachedData, cached: true })
          );
        }
        request.log.info(
          { step: 'patterns-cache-skip', userId },
          'patterns: cache has empty patterns, re-analyzing'
        );
      }
    } catch (err) {
      request.log.warn({ err }, 'patterns cache lookup failed');
    }

    // 重新分析
    try {
      request.log.info({ step: 'patterns-analyze-start', userId }, 'patterns: starting analysis');
      const patterns = await analyzeUserPatterns(pool, userId, app.aiClient);
      // 取 debug 日志
      const debugLogs = (analyzeUserPatterns as { _lastDebug?: PatternDebugLog[] })._lastDebug ?? [];
      request.log.info(
        {
          step: 'patterns-analyze-result',
          userId,
          patternCount: patterns.length,
          types: patterns.map((p) => p.pattern_type),
          debugLogs,
        },
        'patterns: analysis complete'
      );

      const responseData = {
        patterns,
        analyzed_messages: patterns.length > 0 ? 30 : 0,
        sufficient_data: true,
        message:
          patterns.length > 0
            ? `发现了 ${patterns.length} 个关系模式`
            : '暂时没有发现明显的关系模式，继续聊聊看',
      };

      // 写入缓存（fire-and-forget）
      // 找一个 session 来挂载缓存消息
      pool
        .query<{ id: string }>(
          `SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [userId]
        )
        .then((sessionRes) => {
          const sessionId = sessionRes.rows[0]?.id;
          if (!sessionId) return;
          return pool.query(
            `INSERT INTO messages (session_id, role, content, structured_json)
             VALUES ($1, 'system', '[patterns_cache]', $2)`,
            [
              sessionId,
              JSON.stringify({
                _patterns_cache: responseData,
                _cached_at: new Date().toISOString(),
              }),
            ]
          );
        })
        .catch((err) => {
          request.log.warn({ err }, 'patterns cache write failed');
        });

      return reply.send(ok({ ...responseData, cached: false }));
    } catch (err) {
      request.log.warn({ err }, 'pattern analysis failed');
      // 检查是否是数据不足（analyzeUserPatterns 在 <10 条时返回空数组）
      return reply.send(
        ok({
          patterns: [],
          analyzed_messages: 0,
          sufficient_data: false,
          cached: false,
          message: '再多聊几次，我就能看出你的关系模式了',
        })
      );
    }
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

/**
 * Analytics tracker（Phase 7）
 *
 * 写入 analytics_events 表，fire-and-forget：
 * - 异步调用 pool.query，不 await 到主流程
 * - 失败只记日志，不抛错、不阻塞业务
 * - 不记录用户原始脆弱表达，只存行为指标（CLAUDE.md §14.2）
 *
 * 使用：
 *   const tracker = createTracker(pool);
 *   tracker.track('chat_message_sent', { session_id }, userId);
 */

/** 与 pg.Pool 结构兼容的最小接口，避免 packages 直接依赖 pg。 */
export interface AnalyticsPool {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

export type AnalyticsEventName =
  | 'chat_message_sent'
  | 'analysis_requested'
  | 'recovery_plan_created'
  | 'recovery_checkin_completed'
  | 'safety_triggered'
  | 'memory_deleted'
  // 兜底：允许未来新事件
  | (string & {});

export interface Tracker {
  track: (
    eventName: AnalyticsEventName,
    properties?: Record<string, unknown>,
    userId?: string | null
  ) => void;
}

/** 创建一个带数据库写入的 tracker。失败完全静默。 */
export function createTracker(pool: AnalyticsPool): Tracker {
  return {
    track(eventName, properties = {}, userId = null) {
      // fire-and-forget：不 return Promise
      void pool
        .query(
          `INSERT INTO analytics_events (event_name, user_id, properties)
           VALUES ($1, $2, $3::jsonb)`,
          [eventName, userId, JSON.stringify(properties)]
        )
        .catch((err: unknown) => {
          // 埋点失败不得影响主流程，只记录
          // eslint-disable-next-line no-console
          console.warn('[analytics] track failed:', eventName, (err as Error).message);
        });
    },
  };
}

/** 空 tracker：测试或未配置数据库时使用，不做任何事。 */
export function createNoopTracker(): Tracker {
  return {
    track() {
      /* noop */
    },
  };
}

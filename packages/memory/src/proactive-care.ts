/**
 * 主动关心文案生成 - Phase 7+
 *
 * 在 orchestrator Step 1.5 调用：根据情绪趋势 + 计划状态 + 上次活跃时间，
 * 决定要不要在本轮回复前先说一句关心。
 *
 * 设计原则：
 *  - 纯函数，不依赖 DB / AI / 网络。所有状态由调用方拼好传进来
 *  - 不在 risk >= high 时触发（safety 流程优先，关心文案会显得轻浮）
 *  - 同一天不重复触发（外层用 hasCaredToday 判断后再调用）
 *  - 文案不写绝对承诺、不制造依赖，符合 CLAUDE.md §13.2 guard 规则
 */
import type { EmotionTrend } from './emotion-trend.js';

export type CareType =
  | 'trend_concern'
  | 'plan_reminder'
  | 'returning_user'
  | 'improvement';

export interface ProactiveCareContext {
  trend: EmotionTrend | null;
  hasActivePlan: boolean;
  checkedInToday: boolean;
  /** 当前小时（0-23），用于判断"晚上才提醒打卡" */
  currentHour: number;
  /** 用户上一条消息的 ISO 时间，用于判断"久未出现" */
  lastMessageAt: string | null;
  /** 当前会话 effective_risk，high/critical 时静默不触发 */
  currentRisk?: string;
  /** 今天是否已经触发过主动关心（来自 hasCaredToday 查询） */
  alreadyCaredToday?: boolean;
  /** 用户今天是否已经发过消息（用 improvement 文案前要确认是"今天第一句"） */
  isFirstMessageToday?: boolean;
}

export interface ProactiveCareResult {
  shouldCare: boolean;
  message: string;
  care_type: CareType | null;
}

const NO_CARE: ProactiveCareResult = {
  shouldCare: false,
  message: '',
  care_type: null,
};

/**
 * 按优先级评估四种触发条件，返回第一个命中的关心文案。
 *
 * 优先级（高 → 低）：
 *  1. trend_concern  连续低分 ≥ 3 天
 *  2. improvement    曲线在好转 + 数据点 ≥ 5 + 今天第一句话
 *  3. plan_reminder  有 active plan + 今天没打卡 + 当前已 18:00 后
 *  4. returning_user lastMessageAt 距今超过 3 天
 */
export function generateProactiveCare(
  ctx: ProactiveCareContext
): ProactiveCareResult {
  // 风险拦截：高/极高风险时不打扰，让 safety 流程接管
  if (ctx.currentRisk === 'high' || ctx.currentRisk === 'critical') {
    return NO_CARE;
  }
  // 同一天只关心一次
  if (ctx.alreadyCaredToday === true) {
    return NO_CARE;
  }

  // 1) trend_concern：最高优先级
  if (ctx.trend && ctx.trend.consecutive_low_days >= 3) {
    return {
      shouldCare: true,
      care_type: 'trend_concern',
      message:
        '兄弟，我注意到你这几天情绪一直不太好。不用急着说什么，就是想问一句，还撑得住吗？',
    };
  }

  // 2) improvement：曲线在好转 + 数据足够 + 今天第一句话
  if (
    ctx.trend &&
    ctx.trend.direction === 'improving' &&
    ctx.trend.data_points >= 5 &&
    ctx.isFirstMessageToday === true
  ) {
    return {
      shouldCare: true,
      care_type: 'improvement',
      message:
        '说实话兄弟，你这几天状态比之前好多了，自己感觉到了吗？继续，别回头。',
    };
  }

  // 3) plan_reminder：有计划没打卡 + 已经入夜
  if (
    ctx.hasActivePlan &&
    !ctx.checkedInToday &&
    ctx.currentHour >= 18
  ) {
    return {
      shouldCare: true,
      care_type: 'plan_reminder',
      message: '对了，今天的计划任务做了吗？做完跟我说一声，打个卡。',
    };
  }

  // 4) returning_user：超过 3 天没出现
  if (ctx.lastMessageAt) {
    const last = Date.parse(ctx.lastMessageAt);
    if (!Number.isNaN(last)) {
      const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) {
        return {
          shouldCare: true,
          care_type: 'returning_user',
          message: '好久没见，这几天怎么样了？',
        };
      }
    }
  }

  return NO_CARE;
}

/**
 * 把情绪趋势翻译成一句对外文案，供 GET /api/memory/emotion-trend 返回。
 * 数据不足时给一句鼓励"继续聊"的占位。
 */
export function trendSummaryMessage(trend: EmotionTrend | null): string {
  if (!trend) {
    return '继续聊几次，我就能看出你的状态变化了';
  }
  if (trend.direction === 'improving') {
    return '你这几天的状态在慢慢好转';
  }
  if (trend.direction === 'declining') {
    return '你这几天情绪有些低落，注意照顾自己';
  }
  // stable
  if (trend.average_score >= 6) {
    return '你最近情绪比较平稳';
  }
  return '你最近情绪有些起伏';
}

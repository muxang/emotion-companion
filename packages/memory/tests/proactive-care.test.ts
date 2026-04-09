/**
 * proactive-care 单元测试
 *
 * 纯函数测试：构造各种 ProactiveCareContext 验证四种触发条件 + 优先级。
 */
import { describe, it, expect } from 'vitest';
import {
  generateProactiveCare,
  trendSummaryMessage,
  type ProactiveCareContext,
} from '../src/proactive-care.js';
import type { EmotionTrend } from '../src/emotion-trend.js';

const baseTrend: EmotionTrend = {
  average_score: 5,
  direction: 'stable',
  consecutive_low_days: 0,
  peak_hours: [],
  dominant_emotion: 'mixed',
  mention_count: { mixed: 5 },
  data_points: 5,
};

function ctx(overrides: Partial<ProactiveCareContext> = {}): ProactiveCareContext {
  return {
    trend: null,
    hasActivePlan: false,
    checkedInToday: false,
    currentHour: 12,
    lastMessageAt: null,
    currentRisk: 'low',
    alreadyCaredToday: false,
    isFirstMessageToday: false,
    ...overrides,
  };
}

describe('generateProactiveCare', () => {
  it('trend_concern：连续 3+ 天低分时触发', () => {
    const result = generateProactiveCare(
      ctx({ trend: { ...baseTrend, consecutive_low_days: 3 } })
    );
    expect(result.shouldCare).toBe(true);
    expect(result.care_type).toBe('trend_concern');
    expect(result.message).toContain('撑得住');
  });

  it('improvement：曲线在好转 + 数据 ≥5 + 今天第一句话', () => {
    const result = generateProactiveCare(
      ctx({
        trend: { ...baseTrend, direction: 'improving', data_points: 5 },
        isFirstMessageToday: true,
      })
    );
    expect(result.shouldCare).toBe(true);
    expect(result.care_type).toBe('improvement');
    expect(result.message).toContain('好多了');
  });

  it('improvement：不是今天第一句话则不触发', () => {
    const result = generateProactiveCare(
      ctx({
        trend: { ...baseTrend, direction: 'improving', data_points: 5 },
        isFirstMessageToday: false,
      })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('improvement：数据点不足时不触发', () => {
    const result = generateProactiveCare(
      ctx({
        trend: { ...baseTrend, direction: 'improving', data_points: 4 },
        isFirstMessageToday: true,
      })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('plan_reminder：有计划没打卡 + 18:00 后', () => {
    const result = generateProactiveCare(
      ctx({
        hasActivePlan: true,
        checkedInToday: false,
        currentHour: 20,
      })
    );
    expect(result.shouldCare).toBe(true);
    expect(result.care_type).toBe('plan_reminder');
    expect(result.message).toContain('打个卡');
  });

  it('plan_reminder：白天不触发', () => {
    const result = generateProactiveCare(
      ctx({
        hasActivePlan: true,
        checkedInToday: false,
        currentHour: 10,
      })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('plan_reminder：已打卡不触发', () => {
    const result = generateProactiveCare(
      ctx({
        hasActivePlan: true,
        checkedInToday: true,
        currentHour: 20,
      })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('returning_user：lastMessageAt 距今超过 3 天', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const result = generateProactiveCare(
      ctx({ lastMessageAt: fourDaysAgo })
    );
    expect(result.shouldCare).toBe(true);
    expect(result.care_type).toBe('returning_user');
    expect(result.message).toContain('好久');
  });

  it('returning_user：3 天内不触发', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = generateProactiveCare(
      ctx({ lastMessageAt: twoDaysAgo })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('风险拦截：currentRisk=high 时静默不触发', () => {
    const result = generateProactiveCare(
      ctx({
        trend: { ...baseTrend, consecutive_low_days: 5 },
        currentRisk: 'high',
      })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('风险拦截：currentRisk=critical 时静默不触发', () => {
    const result = generateProactiveCare(
      ctx({
        trend: { ...baseTrend, consecutive_low_days: 5 },
        currentRisk: 'critical',
      })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('alreadyCaredToday：今天已触发过 → 不再触发', () => {
    const result = generateProactiveCare(
      ctx({
        trend: { ...baseTrend, consecutive_low_days: 5 },
        alreadyCaredToday: true,
      })
    );
    expect(result.shouldCare).toBe(false);
  });

  it('优先级：trend_concern > improvement > plan_reminder > returning_user', () => {
    // 多个条件同时满足，应取 trend_concern
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const result = generateProactiveCare(
      ctx({
        trend: {
          ...baseTrend,
          consecutive_low_days: 5,
          direction: 'improving',
          data_points: 6,
        },
        hasActivePlan: true,
        checkedInToday: false,
        currentHour: 22,
        lastMessageAt: fourDaysAgo,
        isFirstMessageToday: true,
      })
    );
    expect(result.care_type).toBe('trend_concern');
  });

  it('trend 为 null 时不触发 trend_concern / improvement，但仍可触发 plan_reminder / returning_user', () => {
    // 1. null + 没计划 + 没历史 → 完全不触发
    const r1 = generateProactiveCare(ctx({ trend: null }));
    expect(r1.shouldCare).toBe(false);

    // 2. null + 有 plan + 已 18 点 → plan_reminder 仍触发
    const r2 = generateProactiveCare(
      ctx({ trend: null, hasActivePlan: true, currentHour: 19 })
    );
    expect(r2.shouldCare).toBe(true);
    expect(r2.care_type).toBe('plan_reminder');
  });
});

describe('trendSummaryMessage', () => {
  it('null → 占位', () => {
    expect(trendSummaryMessage(null)).toContain('继续聊');
  });
  it('improving', () => {
    expect(
      trendSummaryMessage({ ...baseTrend, direction: 'improving' })
    ).toContain('好转');
  });
  it('stable + 高分', () => {
    expect(
      trendSummaryMessage({
        ...baseTrend,
        direction: 'stable',
        average_score: 7,
      })
    ).toContain('平稳');
  });
  it('stable + 低分', () => {
    expect(
      trendSummaryMessage({
        ...baseTrend,
        direction: 'stable',
        average_score: 4,
      })
    ).toContain('起伏');
  });
  it('declining', () => {
    expect(
      trendSummaryMessage({ ...baseTrend, direction: 'declining' })
    ).toContain('低落');
  });
});

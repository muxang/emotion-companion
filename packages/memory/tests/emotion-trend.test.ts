/**
 * emotion-trend 单元测试
 *
 * 用 computeTrend 直接测算法逻辑，不打 DB。
 * getEmotionTrend 的 SQL 拼接由集成测试覆盖。
 */
import { describe, it, expect } from 'vitest';
import {
  computeTrend,
  scoreOf,
  type EmotionDataPoint,
} from '../src/emotion-trend.js';

function pt(
  emotion_state: string,
  risk_level: string,
  daysAgo: number,
  hour = 12
): EmotionDataPoint {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  now.setHours(hour, 0, 0, 0);
  return { emotion_state, risk_level, created_at: now.toISOString() };
}

describe('scoreOf', () => {
  it('正常情绪映射到 1-10', () => {
    expect(scoreOf({ emotion_state: 'desperate', risk_level: 'low' })).toBe(1);
    expect(scoreOf({ emotion_state: 'numb', risk_level: 'low' })).toBe(2);
    expect(scoreOf({ emotion_state: 'sad', risk_level: 'low' })).toBe(3);
    expect(scoreOf({ emotion_state: 'lonely', risk_level: 'low' })).toBe(3);
    expect(scoreOf({ emotion_state: 'angry', risk_level: 'low' })).toBe(4);
    expect(scoreOf({ emotion_state: 'anxious', risk_level: 'low' })).toBe(4);
    expect(scoreOf({ emotion_state: 'confused', risk_level: 'low' })).toBe(5);
    expect(scoreOf({ emotion_state: 'mixed', risk_level: 'low' })).toBe(5);
  });

  it('high/critical 风险扣 1 分，最低 1', () => {
    expect(scoreOf({ emotion_state: 'sad', risk_level: 'high' })).toBe(2);
    expect(scoreOf({ emotion_state: 'sad', risk_level: 'critical' })).toBe(2);
    expect(scoreOf({ emotion_state: 'desperate', risk_level: 'critical' })).toBe(1);
  });

  it('未知 emotion_state 视为 5', () => {
    expect(scoreOf({ emotion_state: 'whatever', risk_level: 'low' })).toBe(5);
  });
});

describe('computeTrend', () => {
  it('数据点 < 3 时返回 null', () => {
    expect(computeTrend([])).toBeNull();
    expect(computeTrend([pt('sad', 'low', 0)])).toBeNull();
    expect(computeTrend([pt('sad', 'low', 0), pt('mixed', 'low', 1)])).toBeNull();
  });

  it('improving：前半低分 + 后半高分 → improving', () => {
    const points = [
      pt('desperate', 'low', 6),
      pt('numb', 'low', 5),
      pt('sad', 'low', 4),
      pt('confused', 'low', 3),
      pt('mixed', 'low', 2),
      pt('mixed', 'low', 1),
    ];
    const trend = computeTrend(points)!;
    expect(trend).not.toBeNull();
    expect(trend.direction).toBe('improving');
    expect(trend.data_points).toBe(6);
  });

  it('declining：前半高分 + 后半低分 → declining', () => {
    const points = [
      pt('mixed', 'low', 6),
      pt('mixed', 'low', 5),
      pt('confused', 'low', 4),
      pt('sad', 'low', 3),
      pt('numb', 'low', 2),
      pt('desperate', 'low', 1),
    ];
    const trend = computeTrend(points)!;
    expect(trend.direction).toBe('declining');
  });

  it('stable：前后两半差值 ≤ 0.5', () => {
    const points = [
      pt('mixed', 'low', 5),
      pt('mixed', 'low', 4),
      pt('confused', 'low', 3),
      pt('mixed', 'low', 2),
      pt('confused', 'low', 1),
    ];
    const trend = computeTrend(points)!;
    expect(trend.direction).toBe('stable');
  });

  it('consecutive_low_days：从最新一天往前数连续低分天数', () => {
    // 4 天前 mixed (5)，3 天前 sad (3)，2 天前 desperate (1)，1 天前 numb (2)
    // 从最新（1 天前）往前：numb=2 ≤3 ✓, desperate=1 ≤3 ✓, sad=3 ≤3 ✓, mixed=5 > 3 → 停
    // 连续 3 天
    const points = [
      pt('mixed', 'low', 4),
      pt('sad', 'low', 3),
      pt('desperate', 'low', 2),
      pt('numb', 'low', 1),
    ];
    const trend = computeTrend(points)!;
    expect(trend.consecutive_low_days).toBe(3);
  });

  it('consecutive_low_days：最新一天就高于 3 → 0', () => {
    const points = [
      pt('desperate', 'low', 3),
      pt('sad', 'low', 2),
      pt('mixed', 'low', 1),
    ];
    const trend = computeTrend(points)!;
    expect(trend.consecutive_low_days).toBe(0);
  });

  it('peak_hours：取低分消息出现次数最多的 0-2 个小时', () => {
    const points = [
      pt('sad', 'low', 5, 23),
      pt('sad', 'low', 4, 23),
      pt('sad', 'low', 3, 2),
      pt('mixed', 'low', 2, 14), // 高分不计入 peak
      pt('mixed', 'low', 1, 14),
    ];
    const trend = computeTrend(points)!;
    expect(trend.peak_hours).toContain(23);
    expect(trend.peak_hours.length).toBeLessThanOrEqual(2);
    expect(trend.peak_hours).not.toContain(14);
  });

  it('dominant_emotion + mention_count', () => {
    const points = [
      pt('sad', 'low', 5),
      pt('sad', 'low', 4),
      pt('sad', 'low', 3),
      pt('anxious', 'low', 2),
      pt('mixed', 'low', 1),
    ];
    const trend = computeTrend(points)!;
    expect(trend.dominant_emotion).toBe('sad');
    expect(trend.mention_count.sad).toBe(3);
    expect(trend.mention_count.anxious).toBe(1);
    expect(trend.mention_count.mixed).toBe(1);
  });

  it('average_score 保留一位小数', () => {
    const points = [
      pt('sad', 'low', 3), // 3
      pt('sad', 'low', 2), // 3
      pt('mixed', 'low', 1), // 5
    ];
    const trend = computeTrend(points)!;
    // (3+3+5)/3 = 3.666... → 3.7
    expect(trend.average_score).toBe(3.7);
  });
});

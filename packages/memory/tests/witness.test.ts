/**
 * AI 见证人系统单元测试
 *
 * 测试两层：
 *  1. 触发逻辑（detectWitnessType）— 纯规则，不调 AI
 *  2. 生成层（generateWitnessMessage）— mock AIClient
 */
import { describe, it, expect, vi } from 'vitest';
import {
  detectWitnessType,
  generateWitnessMessage,
  type WitnessRawData,
} from '../src/witness.js';

function baseData(overrides: Partial<WitnessRawData> = {}): WitnessRawData {
  return {
    totalSessions: 10,
    totalMessages: 50,
    firstMessageAt: '2026-03-01T10:00:00Z',
    lastMessageBeforeToday: '2026-04-08T10:00:00Z',
    currentHour: 14,
    currentRiskLevel: 'low',
    earliestMessages: [
      '他为什么不理我',
      '他是不是不喜欢我了',
      '他有没有别人',
      '他怎么能这样',
      '我该怎么办',
    ],
    recentMessages: [
      '我想好好生活',
      '我需要多关心自己',
      '今天心情还行',
      '散步回来了',
      '我要学新东西',
      '感觉好多了',
      '我决定放下了',
      '今天看了本书',
      '明天去见朋友',
      '睡眠好了一些',
    ],
    firstMessage: '他最近对我很冷淡怎么办',
    dominantEntityLabel: '小A',
    dominantEntityRecent: 1,
    dominantEntityEarlier: 3,
    emotionTrend: null,
    previousConsecutiveLowDays: 0,
    hasActivePlan: false,
    planType: null,
    planCurrentDay: 0,
    planTotalDays: 0,
    recentCheckins: 0,
    todayAlreadyWitnessed: false,
    lastWitnessType: null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFakeAI(reply: string | (() => Promise<string>)): any {
  return {
    complete: vi.fn(async () => {
      if (typeof reply === 'function') return reply();
      return reply;
    }),
    streamText: () => ({
      async *[Symbol.asyncIterator]() {
        /* unused */
      },
    }),
    provider: 'fake',
    model: 'fake',
  };
}

// ============================================================
// 触发逻辑测试
// ============================================================

describe('detectWitnessType', () => {
  it('todayAlreadyWitnessed=true → 不触发', () => {
    const r = detectWitnessType(baseData({ todayAlreadyWitnessed: true }));
    expect(r.shouldWitness).toBe(false);
  });

  it('risk=high → 不触发', () => {
    const r = detectWitnessType(baseData({ currentRiskLevel: 'high' }));
    expect(r.shouldWitness).toBe(false);
  });

  it('risk=critical → 不触发', () => {
    const r = detectWitnessType(baseData({ currentRiskLevel: 'critical' }));
    expect(r.shouldWitness).toBe(false);
  });

  it('totalSessions < 1 → 不触发', () => {
    const r = detectWitnessType(baseData({ totalSessions: 0 }));
    expect(r.shouldWitness).toBe(false);
  });

  it('milestone_30：totalSessions===30 触发', () => {
    const r = detectWitnessType(baseData({ totalSessions: 30 }));
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('milestone_30');
  });

  it('milestone_15：totalSessions===15 触发', () => {
    const r = detectWitnessType(baseData({ totalSessions: 15 }));
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('milestone_15');
  });

  it('milestone_5：totalSessions===5 触发', () => {
    const r = detectWitnessType(baseData({ totalSessions: 5 }));
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('milestone_5');
  });

  it('entity_fade：earlierCount>=3, recentCount===0, totalSessions>=8', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 10,
        dominantEntityLabel: '小A',
        dominantEntityEarlier: 4,
        dominantEntityRecent: 0,
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('entity_fade');
    expect(r.trigger_evidence.entityLabel).toBe('小A');
  });

  it('decision_made：消息含"我决定"触发', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 10,
        dominantEntityRecent: 2, // 让 entity_fade 不触发
        recentMessages: ['我决定放下了', '今天还行'],
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('decision_made');
  });

  it('question_shift：早期含"他为什么"，近期含"我想"', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 10,
        dominantEntityRecent: 2, // 不走 entity_fade
        recentMessages: [
          '我想做点什么',
          '我需要改变',
          '我要好好对自己',
          '嗯好的',
          '今天不错',
        ],
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('question_shift');
  });

  it('emotion_turn：previousLowDays>=3, improving, consecutive_low===0', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 10,
        dominantEntityRecent: 2,
        earliestMessages: ['普通消息', '日常', '没什么', '一般', '还行'],
        emotionTrend: {
          average_score: 6,
          direction: 'improving',
          consecutive_low_days: 0,
          peak_hours: [],
          dominant_emotion: 'mixed',
          mention_count: {},
          data_points: 10,
        },
        previousConsecutiveLowDays: 4,
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('emotion_turn');
  });

  it('after_silence：7天未来触发', () => {
    const sevenDaysAgo = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000
    ).toISOString();
    const r = detectWitnessType(
      baseData({
        totalSessions: 6, // 避免命中 milestone_5
        dominantEntityRecent: 2,
        earliestMessages: ['普通', '消息', '日常', '一般', '还行'],
        lastMessageBeforeToday: sevenDaysAgo,
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('after_silence');
  });

  it('first_return：totalMessages<=2 且有 firstMessage 触发', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 1, // 同 session 内第 2 条也能触发
        totalMessages: 1,
        dominantEntityRecent: 2,
        earliestMessages: ['普通消息'],
        firstMessage: '他最近对我很冷淡怎么办',
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('first_return');
  });

  it('plan_persist：第7天触发', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 10,
        dominantEntityRecent: 2,
        earliestMessages: ['普通', '消息', '日常', '一般', '还行'],
        hasActivePlan: true,
        planCurrentDay: 7,
        planTotalDays: 14,
        planType: '14day-rumination',
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('plan_persist');
  });

  it('late_night_persist：23点 + totalMessages>=1 触发', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 2,
        totalMessages: 4,
        currentHour: 23,
        dominantEntityRecent: 2,
        earliestMessages: ['普通', '消息', '日常', '一般', '还行'],
      })
    );
    expect(r.shouldWitness).toBe(true);
    expect(r.witness_type).toBe('late_night_persist');
  });

  it('优先级：同时满足 milestone_30 和 entity_fade，返回 milestone_30', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 30,
        dominantEntityEarlier: 5,
        dominantEntityRecent: 0,
      })
    );
    expect(r.witness_type).toBe('milestone_30');
  });

  it('无条件满足 → shouldWitness=false', () => {
    const r = detectWitnessType(
      baseData({
        totalSessions: 4, // 不是 5/15/30
        dominantEntityRecent: 2, // 不走 entity_fade
        earliestMessages: ['嗯', '好的'], // 不够 question_shift
        currentHour: 14, // 不是深夜
        hasActivePlan: false,
      })
    );
    expect(r.shouldWitness).toBe(false);
  });
});

// ============================================================
// 生成层测试（mock AI）
// ============================================================

describe('generateWitnessMessage', () => {
  it('正常调用：返回见证文案，去掉感叹号', async () => {
    const ai = makeFakeAI('你来了第五次了。这件事本身，值得被记住!');
    const result = await generateWitnessMessage(
      'milestone_5',
      { totalSessions: 5 },
      baseData(),
      ai
    );
    expect(result).toContain('你来了第五次了');
    expect(result).not.toContain('!');
    expect(ai.complete).toHaveBeenCalledTimes(1);
  });

  it('去掉"作为见证者"元语言', async () => {
    const ai = makeFakeAI('作为见证者，你来了第五次了。这件事本身，值得被记住。');
    const result = await generateWitnessMessage(
      'milestone_5',
      { totalSessions: 5 },
      baseData(),
      ai
    );
    expect(result).not.toContain('作为见证者');
  });

  it('AI 超时：静默跳过，返回空字符串', async () => {
    const ai = makeFakeAI(async () => {
      throw new Error('timeout');
    });
    const result = await generateWitnessMessage(
      'milestone_5',
      { totalSessions: 5 },
      baseData(),
      ai
    );
    expect(result).toBe('');
  });

  it('AI 输出过长（>150字）：截断到最后句号', async () => {
    const longText =
      '这个人来了很多次。' +
      '每次来的时候都在思考。'.repeat(10) +
      '最后一句话在这里。';
    const ai = makeFakeAI(longText);
    const result = await generateWitnessMessage(
      'milestone_30',
      { totalSessions: 30 },
      baseData(),
      ai
    );
    expect(result.length).toBeLessThanOrEqual(151);
    expect(result.endsWith('。')).toBe(true);
  });

  it('AI 输出过短（<10字）：静默跳过', async () => {
    const ai = makeFakeAI('嗯。');
    const result = await generateWitnessMessage(
      'milestone_5',
      { totalSessions: 5 },
      baseData(),
      ai
    );
    expect(result).toBe('');
  });
});

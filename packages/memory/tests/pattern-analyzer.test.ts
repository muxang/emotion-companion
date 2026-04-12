import { describe, it, expect, vi } from 'vitest';
import {
  detectPatterns,
  generatePatternContent,
} from '../src/pattern-analyzer.js';

function repeat(msg: string, n: number): string[] {
  return Array.from({ length: n }, () => msg);
}

function pad(msgs: string[], total = 8): string[] {
  if (msgs.length >= total) return msgs;
  const filler = repeat('今天还行', total - msgs.length);
  return [...msgs, ...filler];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeAI(reply: string | (() => Promise<string>)): any {
  return {
    complete: vi.fn(async () => (typeof reply === 'function' ? reply() : reply)),
    streamText: () => ({ async *[Symbol.asyncIterator]() {} }),
    provider: 'fake',
    model: 'fake',
  };
}

// ============================================================
// 规则识别测试
// ============================================================

describe('detectPatterns', () => {
  it('消息少于5条 → 空数组', () => {
    expect(detectPatterns(repeat('他肯定不爱我', 4))).toEqual([]);
  });

  it('over_interpretation：3个关键词命中触发', () => {
    const msgs = pad([
      '他肯定是不喜欢我了',
      '他一定有别人了',
      '感觉他在敷衍',
    ]);
    const r = detectPatterns(msgs);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.type).toBe('over_interpretation');
    expect(r[0]!.evidence_count).toBeGreaterThanOrEqual(3);
  });

  it('over_interpretation：只有1条不触发', () => {
    const msgs = pad(['他肯定不喜欢我']);
    const r = detectPatterns(msgs);
    const oi = r.find((p) => p.type === 'over_interpretation');
    expect(oi).toBeUndefined();
  });

  it('excessive_giving：self>=3 且 >other*2', () => {
    const msgs = pad([
      '我主动找他',
      '我一直在等他',
      '我又去找他了',
    ]);
    const r = detectPatterns(msgs);
    expect(r.some((p) => p.type === 'excessive_giving')).toBe(true);
  });

  it('approval_seeking：2条触发', () => {
    const msgs = pad([
      '他是不是还喜欢我',
      '他还在意吗',
    ]);
    const r = detectPatterns(msgs);
    expect(r.some((p) => p.type === 'approval_seeking')).toBe(true);
  });

  it('self_blame：2条触发', () => {
    const msgs = pad([
      '是不是我不够好',
      '都是我的错',
    ]);
    const r = detectPatterns(msgs);
    expect(r.some((p) => p.type === 'self_blame')).toBe(true);
  });

  it('ambiguity_tolerance：3条算了 + 他>=5次', () => {
    const msgs = pad([
      '算了不想了',
      '算了吧',
      '顺其自然吧',
      '他他他他他说什么都无所谓',
    ]);
    const r = detectPatterns(msgs);
    expect(r.some((p) => p.type === 'ambiguity_tolerance')).toBe(true);
  });

  it('boundary_weakness：2条触发', () => {
    const msgs = pad([
      '又忍不住去看了',
      '我知道不该但还是发了',
    ]);
    const r = detectPatterns(msgs);
    expect(r.some((p) => p.type === 'boundary_weakness')).toBe(true);
  });

  it('confidence 计算正确', () => {
    // over_interpretation threshold=3
    // 命中3次 → 0.6 + (3-3)*0.1 = 0.6
    // 命中5次 → 0.6 + (5-3)*0.1 = 0.8
    const msgs = pad([
      '他肯定是', '他一定是', '感觉他', '他这样做是', '说明他',
    ]);
    const r = detectPatterns(msgs);
    const oi = r.find((p) => p.type === 'over_interpretation');
    expect(oi).toBeDefined();
    expect(oi!.confidence).toBeCloseTo(0.8, 1);
  });

  it('hit_examples 截取前50字', () => {
    const longMsg = '他肯定是' + '这是一段很长的消息'.repeat(10);
    const msgs = pad(repeat(longMsg, 5), 12);
    const r = detectPatterns(msgs);
    if (r.length > 0) {
      for (const ex of r[0]!.hit_examples) {
        expect(ex.length).toBeLessThanOrEqual(50);
      }
    }
  });

  it('最多返回3个，按confidence降序', () => {
    // 构造同时命中多个模式的数据
    const msgs = pad([
      '他肯定是不喜欢我', '他一定有别人', '感觉他在敷衍', '说明他不爱我',
      '我主动找他', '我一直在等', '我又去找了',
      '是不是我不够好', '都是我的错',
      '又忍不住', '我知道不该但',
    ]);
    const r = detectPatterns(msgs);
    expect(r.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < r.length; i++) {
      expect(r[i]!.confidence).toBeLessThanOrEqual(r[i - 1]!.confidence);
    }
  });
});

// ============================================================
// 子类型测试
// ============================================================

describe('detectPatterns 子类型', () => {
  it('不回消息多次 → silent_interpretation', () => {
    const msgs = pad([
      '感觉他在故意不回消息',
      '已读不回说明他不在意',
      '他肯定是故意不回',
    ]);
    const r = detectPatterns(msgs);
    const oi = r.find((p) => p.type === 'over_interpretation');
    expect(oi?.sub_type).toBe('silent_interpretation');
  });

  it('你觉得出现多次 → ai_approval', () => {
    const msgs = pad([
      '你觉得他是不是还喜欢我',
      '你觉得他还有感情吗',
    ]);
    const r = detectPatterns(msgs);
    const ap = r.find((p) => p.type === 'approval_seeking');
    expect(ap?.sub_type).toBe('ai_approval');
  });

  it('刷他朋友圈 → digital_stalking', () => {
    const msgs = pad([
      '又忍不住刷他朋友圈了',
      '控制不住去看他动态',
    ]);
    const r = detectPatterns(msgs);
    const bw = r.find((p) => p.type === 'boundary_weakness');
    expect(bw?.sub_type).toBe('digital_stalking');
  });
});

// ============================================================
// AI 生成测试（mock）
// ============================================================

describe('generatePatternContent', () => {
  it('正常调用：所有字段有值', async () => {
    const ai = fakeAI(JSON.stringify({
      description: '你有一个习惯。\n\n第二段。\n\n第三段。',
      real_cost: '你在消耗自己',
      suggestion: '下次可以试试这样做',
      next_step: '今天做一件事：写下来',
    }));
    const result = await generatePatternContent(
      'over_interpretation', 'behavior_interpretation',
      ['他肯定不爱我'], ['最近的消息'], ai
    );
    expect(result.description).toContain('你有一个习惯');
    expect(result.real_cost.length).toBeGreaterThan(0);
    expect(result.suggestion.length).toBeGreaterThan(0);
    expect(result.next_step.length).toBeGreaterThan(0);
  });

  it('AI 超时：使用兜底文案', async () => {
    const ai = fakeAI(async () => { throw new Error('timeout'); });
    const result = await generatePatternContent(
      'self_blame', null, ['是不是我的错'], ['最近消息'], ai
    );
    expect(result.description).toContain('是不是我的问题');
    expect(result.real_cost).toContain('道歉');
  });

  it('JSON 解析失败：使用兜底文案', async () => {
    const ai = fakeAI('这不是JSON，只是一段文字');
    const result = await generatePatternContent(
      'boundary_weakness', null, ['又忍不住'], ['最近消息'], ai
    );
    expect(result.description).toContain('意志力');
  });

  it('未知 patternType：使用 over_interpretation 兜底', async () => {
    const ai = fakeAI(async () => { throw new Error('timeout'); });
    const result = await generatePatternContent(
      'unknown_type', null, [], [], ai
    );
    expect(result.description.length).toBeGreaterThan(10);
  });
});

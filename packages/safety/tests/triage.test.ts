import { describe, it, expect, vi } from 'vitest';
import { runKeywordTriage, runFullTriage } from '../src/triage.js';
import { REAL_HELP_GUIDANCE } from '../src/constants.js';
import type { AIClassifierClient } from '../src/ai-classifier.js';

describe('runKeywordTriage - critical 触发', () => {
  const criticalSamples = [
    '我真的不想活了',
    '我想死',
    '我在想自杀',
    '我有自残的想法',
    '我已经在自伤',
    '我想结束生命',
    '我打算结束自己',
    '我活不下去了',
    '我撑不下去了',
    '我想消失了',
  ];

  for (const text of criticalSamples) {
    it(`命中 critical: "${text}"`, () => {
      const r = runKeywordTriage(text);
      expect(r.risk_level).toBe('critical');
      expect(r.safe_mode).toBe(true);
      expect(r.suggest_real_help).toBe(true);
      expect(r.block_analysis).toBe(true);
      expect(r.next_step).toBe('external_support');
      expect(r.support_message).toContain(REAL_HELP_GUIDANCE);
    });
  }
});

describe('runKeywordTriage - high 触发', () => {
  const highSamples = [
    '我想伤害自己',
    '我想消失',
    '我快崩溃了',
    '我已经失控',
    '我撑不住了',
    '我好绝望',
    '我走不出来',
    '没人在乎我',
    '活着没意思',
  ];

  for (const text of highSamples) {
    it(`命中 high: "${text}"`, () => {
      const r = runKeywordTriage(text);
      expect(r.risk_level).toBe('high');
      expect(r.safe_mode).toBe(true);
      expect(r.suggest_real_help).toBe(false);
      expect(r.block_analysis).toBe(true);
      expect(r.next_step).toBe('grounding');
    });
  }
});

describe('runKeywordTriage - 不误判正常情感倾诉', () => {
  const safeSamples = [
    '今天有点累，想早点睡',
    '我好想他，但又不想联系他',
    '他不要我了，我还是有点难过',
    '我和家人吵架了，心里很闷',
    '工作压力大，最近睡不好',
    '我有点失望，感觉一切没意义但还能撑住',
  ];

  for (const text of safeSamples) {
    it(`不误判: "${text}"`, () => {
      const r = runKeywordTriage(text);
      expect(r.risk_level).toBe('low');
      expect(r.safe_mode).toBe(false);
      expect(r.support_message).toBe('');
      expect(r.next_step).toBe('continue_safe_chat');
    });
  }

  it('"不要我了"独立测试：必须不命中 critical', () => {
    const r = runKeywordTriage('他不要我了');
    expect(r.risk_level).toBe('low');
  });
});

describe('runKeywordTriage - 边界与一致性', () => {
  it('空字符串返回 low', () => {
    const r = runKeywordTriage('');
    expect(r.risk_level).toBe('low');
    expect(r.safe_mode).toBe(false);
  });

  it('critical 优先于 high（同时含两类关键词）', () => {
    const r = runKeywordTriage('我快崩溃了，我想死');
    expect(r.risk_level).toBe('critical');
  });

  it('SafetyResponse 字段全集存在', () => {
    const r = runKeywordTriage('我不想活了');
    expect(r).toMatchObject({
      risk_level: expect.any(String),
      safe_mode: expect.any(Boolean),
      support_message: expect.any(String),
      suggest_real_help: expect.any(Boolean),
      block_analysis: expect.any(Boolean),
      next_step: expect.any(String),
    });
  });
});

function makeAi(impl: AIClassifierClient['complete']): AIClassifierClient {
  return { complete: impl };
}

describe('runFullTriage - 关键词 + AI 二次分类', () => {
  it('无 aiClient 时退化为关键词结果', async () => {
    const r = await runFullTriage('我不想活了');
    expect(r.risk_level).toBe('critical');
  });

  it('关键词命中 critical 时直接返回，不调用 AI', async () => {
    const fn = vi.fn().mockResolvedValue('{"risk_level":"low","confidence":0.9,"reasoning":""}');
    const r = await runFullTriage('我想死', makeAi(fn));
    expect(r.risk_level).toBe('critical');
    expect(fn).not.toHaveBeenCalled();
  });

  it('关键词命中 high 时直接返回，不调用 AI', async () => {
    const fn = vi.fn().mockResolvedValue('{"risk_level":"low","confidence":0.9,"reasoning":""}');
    const r = await runFullTriage('我快崩溃了', makeAi(fn));
    expect(r.risk_level).toBe('high');
    expect(fn).not.toHaveBeenCalled();
  });

  it('关键词 low + AI 升级为 high → 取较高值 high', async () => {
    const fn = vi.fn().mockResolvedValue(
      '{"risk_level":"high","confidence":0.9,"reasoning":"语义层判断"}'
    );
    const r = await runFullTriage('感觉一切都没意义了，撑不太住', makeAi(fn));
    expect(r.risk_level).toBe('high');
    expect(r.safe_mode).toBe(true);
    expect(r.block_analysis).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('关键词 low + AI 仍判 low → 保持 low', async () => {
    const fn = vi.fn().mockResolvedValue(
      '{"risk_level":"low","confidence":0.8,"reasoning":""}'
    );
    const r = await runFullTriage('今天天气还行', makeAi(fn));
    expect(r.risk_level).toBe('low');
    expect(r.safe_mode).toBe(false);
  });

  it('AI 超时 → 沉默回退到关键词结果', async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise<string>(() => undefined)
    );
    const r = await runFullTriage('我有点烦', makeAi(fn), { timeoutMs: 50 });
    expect(r.risk_level).toBe('low');
  });

  it('AI 解析失败 → 沉默回退到关键词结果', async () => {
    const fn = vi.fn().mockResolvedValue('not json at all');
    const r = await runFullTriage('我有点烦', makeAi(fn));
    expect(r.risk_level).toBe('low');
  });

  it('AI 升级到 critical → 取 critical 并填充 critical 文案', async () => {
    const fn = vi.fn().mockResolvedValue(
      '{"risk_level":"critical","confidence":0.99,"reasoning":"具体计划"}'
    );
    const r = await runFullTriage('我已经准备好了所有的东西', makeAi(fn));
    expect(r.risk_level).toBe('critical');
    expect(r.suggest_real_help).toBe(true);
    expect(r.support_message).toContain(REAL_HELP_GUIDANCE);
  });
});

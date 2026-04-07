import { describe, it, expect } from 'vitest';
import { runKeywordTriage } from '../src/triage.js';
import { REAL_HELP_GUIDANCE } from '../src/constants.js';

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

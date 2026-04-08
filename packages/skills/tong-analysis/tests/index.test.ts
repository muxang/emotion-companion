import { describe, it, expect, vi } from 'vitest';
import type { AIClient } from '@emotion/core-ai';
import type { TongAnalysisInput } from '@emotion/shared';
import {
  BlockedByRiskError,
  buildTongAnalysisPrompt,
  parseTongAnalysisOutput,
  runTongAnalysis,
  SAFE_DEFAULT_ANALYSIS,
} from '../src/index.js';

const SAMPLE_INPUT: TongAnalysisInput = {
  user_goal: '看清这段关系',
  relationship_stage: '暧昧三个月',
  facts: ['一周不主动联系', '只在深夜回消息', '从不主动约见面'],
  user_state: '反复内耗',
  required_output: ['analysis', 'evidence', 'risks', 'advice'],
};

function makeFakeAI(replies: string[] | (() => Promise<string>)): AIClient {
  let idx = 0;
  return {
    getModel: () => 'fake',
    complete: vi.fn(async () => {
      if (typeof replies === 'function') return replies();
      const r = replies[idx] ?? replies[replies.length - 1] ?? '';
      idx++;
      return r;
    }),
    streamText: () => ({
      async *[Symbol.asyncIterator]() {
        /* unused */
      },
    }),
  } as unknown as AIClient;
}

describe('tong-analysis: prompt 构造', () => {
  it('包含所有结构化字段且不混入用户原文', () => {
    const { system, user } = buildTongAnalysisPrompt(SAMPLE_INPUT);
    expect(system).toContain('JSON');
    expect(system).toContain('gentle');
    expect(user).toContain('看清这段关系');
    expect(user).toContain('一周不主动联系');
    expect(user).toContain('暧昧三个月');
    expect(user).toContain('analysis');
  });
});

describe('tong-analysis: 解析正常输入', () => {
  it('解析纯 JSON 字符串', () => {
    const raw = JSON.stringify({
      analysis: '存在拉扯模式',
      evidence: ['深夜回消息'],
      risks: ['长期内耗'],
      advice: '减少主动消息频率,观察一周',
      confidence: 0.7,
      tone: 'neutral',
    });
    const out = parseTongAnalysisOutput(raw);
    expect(out.tone).toBe('neutral');
    expect(out.confidence).toBe(0.7);
    expect(out.evidence).toEqual(['深夜回消息']);
  });

  it('解析 markdown ```json``` 包裹的 JSON', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        analysis: '存在拉扯',
        evidence: [],
        risks: [],
        advice: '观察两周',
        confidence: 0.5,
        tone: 'gentle',
      }) +
      '\n```';
    const out = parseTongAnalysisOutput(raw);
    expect(out.tone).toBe('gentle');
    expect(out.advice).toBe('观察两周');
  });

  it('解析无语言标识的 ``` 代码块包裹', () => {
    const raw =
      '```\n' +
      JSON.stringify({
        analysis: 'x',
        evidence: [],
        risks: [],
        advice: 'y',
        confidence: 0.3,
        tone: 'direct',
      }) +
      '\n```';
    const out = parseTongAnalysisOutput(raw);
    expect(out.tone).toBe('direct');
  });
});

describe('tong-analysis: 解析失败安全降级', () => {
  it('完全不是 JSON 时返回安全默认值', () => {
    const out = parseTongAnalysisOutput('我无法回答');
    expect(out).toEqual(SAFE_DEFAULT_ANALYSIS);
  });

  it('JSON 但缺字段时返回安全默认值', () => {
    const out = parseTongAnalysisOutput(
      JSON.stringify({ analysis: '只有这一个字段' })
    );
    expect(out).toEqual(SAFE_DEFAULT_ANALYSIS);
  });

  it('tone 不在白名单时返回安全默认值', () => {
    const out = parseTongAnalysisOutput(
      JSON.stringify({
        analysis: 'x',
        evidence: [],
        risks: [],
        advice: 'y',
        confidence: 0.5,
        tone: 'aggressive',
      })
    );
    expect(out).toEqual(SAFE_DEFAULT_ANALYSIS);
  });

  it('空字符串返回安全默认值', () => {
    const out = parseTongAnalysisOutput('');
    expect(out).toEqual(SAFE_DEFAULT_ANALYSIS);
  });

  it('JSON 被截断在 analysis 字段中段时，返回降级的部分结果而非 SAFE_DEFAULT', () => {
    // 模拟模型 finish_reason=length：analysis 写到一半就停了，
    // 既无收口引号也无收口大括号
    const truncated =
      '{"analysis":"目前你只提供了一个主观感受——「忽冷忽热」，但缺乏具体行为细节，所以很难给出可靠判断。继续观察对方';
    const out = parseTongAnalysisOutput(truncated);
    expect(out).not.toEqual(SAFE_DEFAULT_ANALYSIS);
    expect(out.analysis).toContain('忽冷忽热');
    expect(out.analysis).toContain('继续观察对方');
    expect(out.confidence).toBe(0.3);
    expect(out.tone).toBe('neutral');
    expect(out.evidence).toEqual([]);
    expect(out.risks).toEqual([]);
    expect(out.advice.length).toBeGreaterThan(0);
  });

  it('截断 JSON 中 analysis 为空字符串时，仍走 SAFE_DEFAULT', () => {
    const truncated = '{"analysis":"';
    const out = parseTongAnalysisOutput(truncated);
    expect(out).toEqual(SAFE_DEFAULT_ANALYSIS);
  });
});

describe('tong-analysis: runTongAnalysis 集成', () => {
  it('正常路径：解析成功并返回结构化结果', async () => {
    const ai = makeFakeAI([
      JSON.stringify({
        analysis: '存在拉扯模式',
        evidence: ['深夜才回'],
        risks: ['长期内耗'],
        advice: '主动暂停一周',
        confidence: 0.6,
        tone: 'neutral',
      }),
    ]);
    const out = await runTongAnalysis(SAMPLE_INPUT, {
      ai,
      risk_level: 'low',
    });
    expect(out.confidence).toBe(0.6);
    expect(out.tone).toBe('neutral');
    expect(ai.complete).toHaveBeenCalledTimes(1);
  });

  it('AI 抛错时降级到安全默认值，不抛错', async () => {
    const ai = makeFakeAI(async () => {
      throw new Error('network down');
    });
    const out = await runTongAnalysis(SAMPLE_INPUT, {
      ai,
      risk_level: 'low',
    });
    expect(out).toEqual(SAFE_DEFAULT_ANALYSIS);
  });

  it('risk_level=high 时抛 BlockedByRiskError 且不调用 AI', async () => {
    const ai = makeFakeAI(['should-not-be-called']);
    await expect(
      runTongAnalysis(SAMPLE_INPUT, { ai, risk_level: 'high' })
    ).rejects.toBeInstanceOf(BlockedByRiskError);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('risk_level=critical 时抛 BlockedByRiskError 且不调用 AI', async () => {
    const ai = makeFakeAI(['should-not-be-called']);
    await expect(
      runTongAnalysis(SAMPLE_INPUT, { ai, risk_level: 'critical' })
    ).rejects.toBeInstanceOf(BlockedByRiskError);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('非法输入（facts 为空）走安全降级而非抛错', async () => {
    const ai = makeFakeAI(['should-not-be-called']);
    const out = await runTongAnalysis(
      { ...SAMPLE_INPUT, facts: [] },
      { ai, risk_level: 'low' }
    );
    expect(out).toEqual(SAFE_DEFAULT_ANALYSIS);
    expect(ai.complete).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from 'vitest';
import {
  AnalysisResultSchema,
  TongAnalysisInputSchema,
} from '../src/schemas/analysis.js';

describe('TongAnalysisInputSchema', () => {
  it('接受合法结构化输入', () => {
    const r = TongAnalysisInputSchema.safeParse({
      user_goal: '看清这段关系',
      relationship_stage: '暧昧',
      facts: ['一周不联系', '只在深夜回消息'],
      user_state: '反复内耗',
      required_output: ['analysis', 'risks', 'advice'],
    });
    expect(r.success).toBe(true);
  });

  it('facts 为空时拒绝', () => {
    const r = TongAnalysisInputSchema.safeParse({
      user_goal: 'x',
      relationship_stage: 'x',
      facts: [],
      user_state: 'x',
      required_output: ['analysis'],
    });
    expect(r.success).toBe(false);
  });

  it('required_output 含未知值时拒绝', () => {
    const r = TongAnalysisInputSchema.safeParse({
      user_goal: 'x',
      relationship_stage: 'x',
      facts: ['一条事实'],
      user_state: 'x',
      required_output: ['unknown'],
    });
    expect(r.success).toBe(false);
  });
});

describe('AnalysisResultSchema', () => {
  it('接受合法 LLM 输出', () => {
    const r = AnalysisResultSchema.safeParse({
      analysis: '存在拉扯模式',
      evidence: ['深夜才回'],
      risks: ['长期内耗'],
      advice: '主动减少消息频率',
      confidence: 0.7,
      tone: 'neutral',
    });
    expect(r.success).toBe(true);
  });

  it('tone 不在白名单时拒绝', () => {
    const r = AnalysisResultSchema.safeParse({
      analysis: 'x',
      evidence: [],
      risks: [],
      advice: 'x',
      confidence: 0.5,
      tone: 'aggressive',
    });
    expect(r.success).toBe(false);
  });

  it('confidence 超出范围时拒绝', () => {
    const r = AnalysisResultSchema.safeParse({
      analysis: 'x',
      evidence: [],
      risks: [],
      advice: 'x',
      confidence: 1.5,
      tone: 'gentle',
    });
    expect(r.success).toBe(false);
  });
});

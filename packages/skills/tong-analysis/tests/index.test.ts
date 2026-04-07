import { describe, it, expect } from 'vitest';
import {
  buildTongAnalysisPrompt,
  parseTongAnalysisOutput,
} from '../src/index.js';

describe('tong-analysis skill (Phase 0 skeleton)', () => {
  it('builds a structured prompt from facts', () => {
    const p = buildTongAnalysisPrompt({
      user_goal: '看清这段关系',
      relationship_stage: '暧昧',
      facts: ['一周不联系', '只在深夜回消息'],
      user_state: '反复内耗',
      required_output: ['analysis', 'risks', 'advice'],
    });
    expect(p).toContain('一周不联系');
    expect(p).toContain('analysis');
  });

  it('parses a valid analysis output', () => {
    const raw = JSON.stringify({
      analysis: '存在拉扯模式',
      evidence: ['事实1'],
      risks: ['风险1'],
      advice: '建议保持距离',
      confidence: 0.7,
      tone: 'neutral',
    });
    const out = parseTongAnalysisOutput(raw);
    expect(out.tone).toBe('neutral');
    expect(out.confidence).toBe(0.7);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildCompanionPrompt,
  inferTone,
  finalizeCompanionText,
  COMPANION_EMPTY_FALLBACK,
  runCompanionResponse,
} from '../src/index.js';
import type { AIClient } from '@emotion/core-ai';
import type { IntakeResult } from '@emotion/shared';

function fakeIntake(partial: Partial<IntakeResult> = {}): IntakeResult {
  return {
    emotion_state: 'mixed',
    issue_type: 'general',
    risk_level: 'low',
    next_mode: 'companion',
    confidence: 0.8,
    reasoning: 'test',
    ...partial,
  };
}

describe('companion-response.inferTone', () => {
  it('uses explicit tone_preference when provided', () => {
    expect(
      inferTone({
        user_text: '随便',
        emotion_state: 'sad', // 否则会推断 warm
        tone_preference: 'direct',
      })
    ).toBe('direct');
  });

  it('returns warm for sad / lonely / desperate', () => {
    expect(inferTone({ user_text: '', emotion_state: 'sad' })).toBe('warm');
    expect(inferTone({ user_text: '', emotion_state: 'lonely' })).toBe('warm');
    expect(inferTone({ user_text: '', emotion_state: 'desperate' })).toBe(
      'warm'
    );
  });

  it('returns rational for relationship-eval / ambiguous', () => {
    expect(
      inferTone({
        user_text: '',
        emotion_state: 'confused',
        intake: fakeIntake({ issue_type: 'relationship-eval' }),
      })
    ).toBe('rational');
    expect(
      inferTone({
        user_text: '',
        emotion_state: 'confused',
        intake: fakeIntake({ issue_type: 'ambiguous' }),
      })
    ).toBe('rational');
  });

  it('falls back to warm by default', () => {
    expect(inferTone({ user_text: '', emotion_state: 'mixed' })).toBe('warm');
    expect(
      inferTone({
        user_text: '',
        emotion_state: 'angry',
        intake: fakeIntake({ issue_type: 'general' }),
      })
    ).toBe('warm');
  });
});

describe('companion-response.buildCompanionPrompt — tone variants', () => {
  it('warm: produces warm system prompt with empathy first', () => {
    const { system, tone } = buildCompanionPrompt({
      user_text: '一个人在房间里好难受',
      emotion_state: 'lonely',
    });
    expect(tone).toBe('warm');
    expect(system).toContain('warm');
    expect(system).toContain('温柔');
    // 必须强调结尾追问
    expect(system).toContain('开放式追问');
  });

  it('warm: respects explicit warm preference', () => {
    const { system, tone } = buildCompanionPrompt({
      user_text: '想找人说说话',
      emotion_state: 'mixed',
      tone_preference: 'warm',
    });
    expect(tone).toBe('warm');
    expect(system).toContain('温柔');
  });

  it('rational: triggered by relationship-eval intake', () => {
    const { system, tone } = buildCompanionPrompt({
      user_text: '我们到底合不合适',
      emotion_state: 'confused',
      intake: fakeIntake({ issue_type: 'relationship-eval' }),
    });
    expect(tone).toBe('rational');
    expect(system).toContain('rational');
    expect(system).toContain('平静');
  });

  it('rational: respects explicit rational preference', () => {
    const { system, tone } = buildCompanionPrompt({
      user_text: '帮我看看',
      emotion_state: 'mixed',
      tone_preference: 'rational',
    });
    expect(tone).toBe('rational');
    expect(system).toContain('陈述句');
  });

  it('direct: respects explicit direct preference', () => {
    const { system, tone } = buildCompanionPrompt({
      user_text: '直接告诉我下一步',
      emotion_state: 'angry',
      tone_preference: 'direct',
    });
    expect(tone).toBe('direct');
    expect(system).toContain('direct');
    expect(system).toContain('直白');
  });

  it('direct: short sentences emphasized', () => {
    const { system, tone } = buildCompanionPrompt({
      user_text: '我现在该怎么办',
      emotion_state: 'mixed',
      tone_preference: 'direct',
    });
    expect(tone).toBe('direct');
    expect(system).toContain('短句');
  });

  it('all tone prompts forbid markdown / json wrapping', () => {
    for (const t of ['warm', 'rational', 'direct'] as const) {
      const { system } = buildCompanionPrompt({
        user_text: 'x',
        emotion_state: 'mixed',
        tone_preference: t,
      });
      expect(system).toContain('markdown');
      expect(system).toContain('JSON');
      expect(system).toContain('永远');
    }
  });

  it('all tone prompts require closing open question with ？', () => {
    for (const t of ['warm', 'rational', 'direct'] as const) {
      const { system } = buildCompanionPrompt({
        user_text: 'x',
        emotion_state: 'mixed',
        tone_preference: t,
      });
      expect(system).toContain('？');
      expect(system).toContain('开放式追问');
    }
  });
});

describe('companion-response.buildCompanionPrompt — context injection', () => {
  it('includes the latest user text and emotion state hint', () => {
    const { messages } = buildCompanionPrompt({
      user_text: '我感觉很孤单',
      emotion_state: 'lonely',
    });
    const last = messages[messages.length - 1]?.content ?? '';
    expect(last).toContain('我感觉很孤单');
    expect(last).toContain('lonely');
  });

  it('includes recent history in order, capped at 6', () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `m${i}`,
    }));
    const { messages } = buildCompanionPrompt({
      user_text: '今天又一个人',
      emotion_state: 'lonely',
      recent_history: history,
    });
    // 6 条历史 + 1 条当前 user_text
    expect(messages).toHaveLength(7);
    // 取的是最后 6 条 m2..m7
    expect(messages[0]?.content).toBe('m2');
    expect(messages[5]?.content).toBe('m7');
  });
});

describe('companion-response.finalizeCompanionText', () => {
  it('passes through normal text trimmed', () => {
    expect(finalizeCompanionText('  你好  ')).toBe('你好');
  });

  it('returns fallback on empty', () => {
    expect(finalizeCompanionText('')).toBe(COMPANION_EMPTY_FALLBACK);
  });

  it('returns fallback on whitespace-only', () => {
    expect(finalizeCompanionText('   \n\t  ')).toBe(COMPANION_EMPTY_FALLBACK);
  });

  it('fallback itself ends with an open question (？)', () => {
    expect(COMPANION_EMPTY_FALLBACK).toContain('？');
  });
});

describe('companion-response.runCompanionResponse', () => {
  it('returns an AsyncIterable that yields chunks from AI', async () => {
    const ai = {
      complete: async () => '',
      streamText: () => ({
        async *[Symbol.asyncIterator]() {
          yield '我';
          yield '听到';
          yield '你了';
        },
      }),
      getModel: () => 'fake',
    } as unknown as AIClient;

    const stream = runCompanionResponse(
      { user_text: '难过', emotion_state: 'sad' },
      { ai }
    );
    let acc = '';
    for await (const chunk of stream) acc += chunk;
    expect(acc).toBe('我听到你了');
  });
});

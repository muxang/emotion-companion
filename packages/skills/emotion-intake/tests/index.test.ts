import { describe, it, expect } from 'vitest';
import {
  buildIntakePrompt,
  parseIntakeOutput,
  extractJson,
  SAFE_DEFAULT_INTAKE,
  runEmotionIntake,
} from '../src/index.js';
import type { AIClient } from '@emotion/core-ai';

describe('emotion-intake.buildIntakePrompt', () => {
  it('contains the latest user message', () => {
    const { system, user } = buildIntakePrompt({ user_text: '我最近很难过' });
    expect(system.length).toBeGreaterThan(50);
    expect(user).toContain('我最近很难过');
  });

  it('renders recent history when provided', () => {
    const { user } = buildIntakePrompt({
      user_text: '我不知道怎么办',
      recent_history: [
        { role: 'user', content: '他三天没回我消息' },
        { role: 'assistant', content: '我听到你了' },
      ],
    });
    expect(user).toContain('他三天没回我消息');
    expect(user).toContain('我听到你了');
  });
});

describe('emotion-intake.extractJson', () => {
  it('returns plain JSON unchanged', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` fences', () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('extracts JSON from text with prose around it', () => {
    expect(extractJson('Sure, here you go: {"a":1} done.')).toBe('{"a":1}');
  });

  it('returns null on no JSON', () => {
    expect(extractJson('hello world')).toBeNull();
  });
});

describe('emotion-intake.parseIntakeOutput', () => {
  it('parses a valid response', () => {
    const raw = JSON.stringify({
      emotion_state: 'sad',
      issue_type: 'breakup',
      risk_level: 'low',
      next_mode: 'companion',
      confidence: 0.8,
      reasoning: 'user mentioned breakup with sad tone',
    });
    const r = parseIntakeOutput(raw);
    expect(r.emotion_state).toBe('sad');
    expect(r.next_mode).toBe('companion');
  });

  it('parses markdown-wrapped JSON', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        emotion_state: 'anxious',
        issue_type: 'ambiguous',
        risk_level: 'medium',
        next_mode: 'companion',
        confidence: 0.6,
        reasoning: 'r',
      }) +
      '\n```';
    const r = parseIntakeOutput(raw);
    expect(r.emotion_state).toBe('anxious');
    expect(r.risk_level).toBe('medium');
  });

  it('returns SAFE_DEFAULT on completely invalid input', () => {
    expect(parseIntakeOutput('not json at all')).toEqual(SAFE_DEFAULT_INTAKE);
  });

  it('returns SAFE_DEFAULT on missing required fields', () => {
    const raw = JSON.stringify({ emotion_state: 'sad' });
    expect(parseIntakeOutput(raw)).toEqual(SAFE_DEFAULT_INTAKE);
  });

  it('returns SAFE_DEFAULT on out-of-range confidence', () => {
    const raw = JSON.stringify({
      emotion_state: 'sad',
      issue_type: 'general',
      risk_level: 'low',
      next_mode: 'companion',
      confidence: 2.5,
      reasoning: 'r',
    });
    expect(parseIntakeOutput(raw)).toEqual(SAFE_DEFAULT_INTAKE);
  });

  it('returns SAFE_DEFAULT on enum mismatch', () => {
    const raw = JSON.stringify({
      emotion_state: 'happy',
      issue_type: 'general',
      risk_level: 'low',
      next_mode: 'companion',
      confidence: 0.5,
      reasoning: 'r',
    });
    expect(parseIntakeOutput(raw)).toEqual(SAFE_DEFAULT_INTAKE);
  });
});

describe('emotion-intake.runEmotionIntake', () => {
  function fakeAi(reply: string): AIClient {
    return {
      complete: async () => reply,
      streamText: () => ({
        async *[Symbol.asyncIterator]() {
          yield reply;
        },
      }),
      getModel: () => 'fake',
    } as unknown as AIClient;
  }

  it('returns parsed result when AI replies valid JSON', async () => {
    const ai = fakeAi(
      JSON.stringify({
        emotion_state: 'lonely',
        issue_type: 'loneliness',
        risk_level: 'low',
        next_mode: 'companion',
        confidence: 0.7,
        reasoning: 'r',
      })
    );
    const r = await runEmotionIntake({ user_text: '我有点孤独' }, { ai });
    expect(r.emotion_state).toBe('lonely');
  });

  it('returns SAFE_DEFAULT when AI throws', async () => {
    const ai = {
      complete: async () => {
        throw new Error('boom');
      },
      streamText: () => ({
        async *[Symbol.asyncIterator]() {
          /* empty */
        },
      }),
      getModel: () => 'fake',
    } as unknown as AIClient;
    const r = await runEmotionIntake({ user_text: '随便' }, { ai });
    expect(r).toEqual(SAFE_DEFAULT_INTAKE);
  });
});

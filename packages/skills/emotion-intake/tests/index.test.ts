import { describe, it, expect } from 'vitest';
import { buildIntakePrompt, parseIntakeOutput } from '../src/index.js';

describe('emotion-intake skill (Phase 0 skeleton)', () => {
  it('builds a prompt that contains the user text', () => {
    const prompt = buildIntakePrompt({ user_text: '我最近很难过' });
    expect(prompt).toContain('我最近很难过');
  });

  it('parses a valid intake JSON output', () => {
    const raw = JSON.stringify({
      emotion_state: 'sad',
      issue_type: 'breakup',
      risk_level: 'low',
      next_mode: 'companion',
      confidence: 0.8,
      reasoning: 'internal',
    });
    const parsed = parseIntakeOutput(raw);
    expect(parsed.emotion_state).toBe('sad');
    expect(parsed.next_mode).toBe('companion');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseIntakeOutput('not json')).toThrow();
  });
});

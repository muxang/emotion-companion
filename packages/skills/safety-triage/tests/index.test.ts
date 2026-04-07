import { describe, it, expect } from 'vitest';
import {
  buildSafetyTriagePrompt,
  parseSafetyTriageOutput,
} from '../src/index.js';

describe('safety-triage skill (Phase 0 skeleton)', () => {
  it('builds a prompt mentioning risk level', () => {
    const p = buildSafetyTriagePrompt({
      user_text: '我撑不下去了',
      detected_risk_level: 'critical',
    });
    expect(p).toContain('critical');
  });

  it('parses a valid safety output', () => {
    const raw = JSON.stringify({
      risk_level: 'critical',
      safe_mode: true,
      support_message: '我在这里',
      suggest_real_help: true,
      block_analysis: true,
      next_step: 'external_support',
    });
    const out = parseSafetyTriageOutput(raw);
    expect(out.safe_mode).toBe(true);
    expect(out.block_analysis).toBe(true);
  });
});

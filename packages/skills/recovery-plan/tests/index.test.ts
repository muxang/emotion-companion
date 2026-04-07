import { describe, it, expect } from 'vitest';
import {
  buildRecoveryPlanPrompt,
  parseRecoveryPlanOutput,
} from '../src/index.js';

describe('recovery-plan skill (Phase 0 skeleton)', () => {
  it('builds a 7-day prompt', () => {
    const p = buildRecoveryPlanPrompt({
      scenario: 'breakup',
      total_days: 7,
      user_state: '低落',
    });
    expect(p).toContain('7-day');
    expect(p).toContain('breakup');
  });

  it('parses a valid plan output', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          day_index: 1,
          task: '允许自己难过',
          reflection_prompt: '今天感受到了什么？',
          encouragement: '你不是一个人',
        },
      ],
    });
    const out = parseRecoveryPlanOutput(raw);
    expect(out.tasks[0].day_index).toBe(1);
  });
});

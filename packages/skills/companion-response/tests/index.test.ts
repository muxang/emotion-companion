import { describe, it, expect } from 'vitest';
import {
  buildCompanionPrompt,
  parseCompanionOutput,
} from '../src/index.js';

describe('companion-response skill (Phase 0 skeleton)', () => {
  it('builds prompt containing user text', () => {
    const p = buildCompanionPrompt({
      user_text: '我感觉很孤单',
      emotion_state: 'lonely',
    });
    expect(p).toContain('我感觉很孤单');
    expect(p).toContain('lonely');
  });

  it('parses a valid companion output', () => {
    const raw = JSON.stringify({
      reply: '我听到你了。',
      followup_question: '今天还发生了什么？',
      suggested_action: '深呼吸三次。',
      tone: 'warm',
    });
    const out = parseCompanionOutput(raw);
    expect(out.tone).toBe('warm');
    expect(out.reply).toBeTruthy();
  });
});

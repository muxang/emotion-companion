import { describe, it, expect } from 'vitest';
import {
  buildMessageCoachPrompt,
  parseMessageCoachOutput,
} from '../src/index.js';

describe('message-coach skill (Phase 0 skeleton)', () => {
  it('builds a prompt mentioning scenario and goal', () => {
    const p = buildMessageCoachPrompt({
      scenario: '冷战三天',
      user_goal: '主动破冰但不卑微',
    });
    expect(p).toContain('冷战三天');
    expect(p).toContain('主动破冰');
  });

  it('parses a valid output', () => {
    const raw = JSON.stringify({
      options: [
        { version: 'A', content: '你好', tone: '温和', usage_tip: '随时' },
      ],
    });
    const out = parseMessageCoachOutput(raw);
    expect(out.options).toHaveLength(1);
  });
});

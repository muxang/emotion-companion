import { describe, it, expect, vi } from 'vitest';
import {
  buildMessageCoachPrompt,
  parseMessageCoachOutput,
  runMessageCoach,
  BlockedByRiskError,
  SAFE_DEFAULT_COACH,
} from '../src/index.js';

const validRaw = JSON.stringify({
  options: [
    {
      version: 'A',
      content: '在吗？方便的时候我们聊几句，不着急。',
      tone: '温和试探',
      usage_tip: '适合对方情绪不稳的阶段。',
    },
    {
      version: 'B',
      content: '我想认真和你说一下我现在的想法。',
      tone: '直接坦诚',
      usage_tip: '适合你想明确表态的时候。',
    },
    {
      version: 'C',
      content: '路过打个招呼，不用回我也不会扣工资。',
      tone: '轻松幽默',
      usage_tip: '适合关系基础不错的时候。',
    },
  ],
});

describe('message-coach prompt', () => {
  it('包含 scenario / user_goal / 关系阶段', () => {
    const { system, user } = buildMessageCoachPrompt({
      scenario: '冷战三天',
      user_goal: '主动破冰但不卑微',
      relationship_stage: '暧昧未确认',
    });
    expect(system).toContain('JSON');
    expect(user).toContain('冷战三天');
    expect(user).toContain('主动破冰');
    expect(user).toContain('暧昧未确认');
  });
});

describe('message-coach parser', () => {
  it('正常解析 3 个版本，按 A/B/C 排序', () => {
    const out = parseMessageCoachOutput(validRaw);
    expect(out.options).toHaveLength(3);
    expect(out.options.map((o) => o.version)).toEqual(['A', 'B', 'C']);
  });

  it('支持 ```json ... ``` markdown 代码块包裹', () => {
    const wrapped = '```json\n' + validRaw + '\n```';
    const out = parseMessageCoachOutput(wrapped);
    expect(out.options).toHaveLength(3);
    expect(out.options[1]?.version).toBe('B');
  });

  it('支持任意 ``` 代码块包裹', () => {
    const wrapped = '前言\n```\n' + validRaw + '\n```\n后记';
    const out = parseMessageCoachOutput(wrapped);
    expect(out.options.map((o) => o.version)).toEqual(['A', 'B', 'C']);
  });

  it('解析非 JSON 时返回 SAFE_DEFAULT_COACH', () => {
    const out = parseMessageCoachOutput('完全不是 JSON 的一段话');
    expect(out).toEqual(SAFE_DEFAULT_COACH);
  });

  it('JSON 缺失字段时返回 SAFE_DEFAULT_COACH', () => {
    const out = parseMessageCoachOutput('{"options":[{"version":"A"}]}');
    expect(out).toEqual(SAFE_DEFAULT_COACH);
  });

  it('版本不全 (A/A/B) 时返回 SAFE_DEFAULT_COACH', () => {
    const bad = JSON.stringify({
      options: [
        { version: 'A', content: 'x', tone: 't', usage_tip: 'u' },
        { version: 'A', content: 'y', tone: 't', usage_tip: 'u' },
        { version: 'B', content: 'z', tone: 't', usage_tip: 'u' },
      ],
    });
    expect(parseMessageCoachOutput(bad)).toEqual(SAFE_DEFAULT_COACH);
  });
});

describe('runMessageCoach', () => {
  it('正常调用 AI 并解析为 3 个版本', async () => {
    const ai = { complete: vi.fn().mockResolvedValue(validRaw) };
    const out = await runMessageCoach(
      { scenario: '冷战', user_goal: '破冰' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ai: ai as any, risk_level: 'low' }
    );
    expect(out.options).toHaveLength(3);
    expect(ai.complete).toHaveBeenCalledOnce();
  });

  it('AI 抛错时降级为 SAFE_DEFAULT_COACH', async () => {
    const ai = { complete: vi.fn().mockRejectedValue(new Error('boom')) };
    const out = await runMessageCoach(
      { scenario: '冷战', user_goal: '破冰' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ai: ai as any, risk_level: 'low' }
    );
    expect(out).toEqual(SAFE_DEFAULT_COACH);
  });

  it('risk_level === high 抛 BlockedByRiskError', async () => {
    const ai = { complete: vi.fn() };
    await expect(
      runMessageCoach(
        { scenario: '冷战', user_goal: '破冰' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { ai: ai as any, risk_level: 'high' }
      )
    ).rejects.toBeInstanceOf(BlockedByRiskError);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('risk_level === critical 抛 BlockedByRiskError', async () => {
    const ai = { complete: vi.fn() };
    await expect(
      runMessageCoach(
        { scenario: '冷战', user_goal: '破冰' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { ai: ai as any, risk_level: 'critical' }
      )
    ).rejects.toBeInstanceOf(BlockedByRiskError);
  });
});

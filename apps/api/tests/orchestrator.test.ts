import { describe, it, expect, vi } from 'vitest';
import './setup.js';
import {
  createFakeAIClient,
  makeMockRepos,
} from './helpers.js';
import { orchestrate } from '../src/orchestrator/index.js';
import type { OrchestratorEvent } from '../src/orchestrator/types.js';
import type { ConversationMode, RiskLevel } from '@emotion/shared';

function makeLogger(): {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeIntakeReply(opts: {
  emotion_state?: string;
  issue_type?: string;
  risk_level?: RiskLevel;
  next_mode?: ConversationMode;
}): string {
  return JSON.stringify({
    emotion_state: opts.emotion_state ?? 'sad',
    issue_type: opts.issue_type ?? 'general',
    risk_level: opts.risk_level ?? 'low',
    next_mode: opts.next_mode ?? 'companion',
    confidence: 0.8,
    reasoning: 'this is internal reasoning that must NOT leak',
  });
}

async function collectEvents(
  gen: AsyncIterable<OrchestratorEvent>
): Promise<OrchestratorEvent[]> {
  const out: OrchestratorEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

async function setupSession(): Promise<{
  mocks: ReturnType<typeof makeMockRepos>;
  sessionId: string;
  userId: string;
}> {
  const mocks = makeMockRepos();
  const user = await mocks.users.createWithAnonymousId('anon-orch-test-001');
  const session = await mocks.sessions.create({ user_id: user.id });
  return { mocks, sessionId: session.id, userId: user.id };
}

describe('orchestrator: critical 场景走 safety', () => {
  it('用户说"我不想活了"时强制 safety，不调 AI', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      // 即使 intake 返回 companion，关键词兜底也会触发 critical
      completeReplies: [makeIntakeReply({ next_mode: 'companion' })],
    });
    const log = makeLogger();
    const ac = new AbortController();

    const events = await collectEvents(
      orchestrate(
        { user_id: userId, session_id: sessionId, user_text: '我不想活了' },
        {
          ai,
          repos: { sessions: mocks.sessions, messages: mocks.messages },
          signal: ac.signal,
          logger: log,
          intakeTimeoutMs: 5000,
        }
      )
    );

    const meta = events.find((e) => e.type === 'meta');
    expect(meta).toBeDefined();
    if (meta?.type === 'meta') {
      expect(meta.mode).toBe('safety');
      expect(meta.risk_level).toBe('critical');
    }

    // safety 文案应该被 yield
    const content = events
      .filter((e): e is { type: 'delta'; content: string } => e.type === 'delta')
      .map((e) => e.content)
      .join('');
    expect(content).toContain('紧急援助');

    // 写库：user + assistant
    expect(mocks.state.appendedMessages).toHaveLength(2);
    expect(mocks.state.appendedMessages[0]?.role).toBe('user');
    expect(mocks.state.appendedMessages[1]?.role).toBe('assistant');

    // intake_result 不含 reasoning
    const userMsg = mocks.state.appendedMessages[0]!;
    expect(userMsg.intake_result).toBeDefined();
    expect((userMsg.intake_result as Record<string, unknown>).reasoning).toBeUndefined();

    // safety 模式只调用了 intake 的 complete（streamText 未调用 companion）
    const streamCalls = ai.__calls.filter((c) => c.kind === 'streamText');
    expect(streamCalls).toHaveLength(0);

    const done = events[events.length - 1];
    expect(done?.type).toBe('done');
  });
});

describe('orchestrator: high 场景禁止 analysis', () => {
  it('intake 返回 analysis 但 risk_level=high 时强制 safety', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        makeIntakeReply({ next_mode: 'analysis', risk_level: 'high' }),
      ],
    });
    const log = makeLogger();
    const ac = new AbortController();

    const events = await collectEvents(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '我感觉走不出来了',
        },
        {
          ai,
          repos: { sessions: mocks.sessions, messages: mocks.messages },
          signal: ac.signal,
          logger: log,
          intakeTimeoutMs: 5000,
        }
      )
    );

    const meta = events.find((e) => e.type === 'meta');
    if (meta?.type === 'meta') {
      expect(meta.mode).toBe('safety');
      expect(meta.risk_level).toBe('high');
    }

    // analysis skill 完全没被调用（streamText 计数为 0）
    const streamCalls = ai.__calls.filter((c) => c.kind === 'streamText');
    expect(streamCalls).toHaveLength(0);
  });
});

describe('orchestrator: companion 正常路径', () => {
  it('low risk + companion → 调用 streamText → guard 通过 → 写库', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        makeIntakeReply({
          emotion_state: 'sad',
          risk_level: 'low',
          next_mode: 'companion',
        }),
      ],
      streamReplies: [
        ['我听到', '你了。可以试试', '今晚给自己泡一杯热水，慢慢喝完。'],
      ],
    });
    const log = makeLogger();
    const ac = new AbortController();

    const events = await collectEvents(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '今天有点难过',
        },
        {
          ai,
          repos: { sessions: mocks.sessions, messages: mocks.messages },
          signal: ac.signal,
          logger: log,
          intakeTimeoutMs: 5000,
        }
      )
    );

    const meta = events.find((e) => e.type === 'meta');
    if (meta?.type === 'meta') {
      expect(meta.mode).toBe('companion');
      expect(meta.risk_level).toBe('low');
    }

    // companion 被调用一次
    const streamCalls = ai.__calls.filter((c) => c.kind === 'streamText');
    expect(streamCalls).toHaveLength(1);

    // delta 被回放
    const content = events
      .filter((e): e is { type: 'delta'; content: string } => e.type === 'delta')
      .map((e) => e.content)
      .join('');
    expect(content).toContain('我听到你了');

    // 写库：user + assistant
    expect(mocks.state.appendedMessages).toHaveLength(2);

    // 不含 reasoning
    const assistant = mocks.state.appendedMessages[1]!;
    const ir = assistant.intake_result as Record<string, unknown>;
    expect(ir.reasoning).toBeUndefined();
    expect(ir.emotion_state).toBe('sad');

    // session message_count 增加 2
    expect(mocks.state.incrementCalls).toHaveLength(1);
    expect(mocks.state.incrementCalls[0]?.delta).toBe(2);
  });
});

describe('orchestrator: 脆弱状态缓冲', () => {
  it('emotion_state=desperate 时强制 companion，不走 analysis', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        makeIntakeReply({
          emotion_state: 'desperate',
          risk_level: 'low',
          next_mode: 'analysis',
        }),
      ],
      streamReplies: [['我听到你了，可以试试深呼吸三次。']],
    });
    const log = makeLogger();
    const ac = new AbortController();

    const events = await collectEvents(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '今天什么都不想做',
        },
        {
          ai,
          repos: { sessions: mocks.sessions, messages: mocks.messages },
          signal: ac.signal,
          logger: log,
          intakeTimeoutMs: 5000,
        }
      )
    );

    const meta = events.find((e) => e.type === 'meta');
    if (meta?.type === 'meta') {
      expect(meta.mode).toBe('companion');
    }

    const streamCalls = ai.__calls.filter((c) => c.kind === 'streamText');
    expect(streamCalls).toHaveLength(1);
  });
});

describe('orchestrator: guard 重试', () => {
  it('第一次 fail 触发重试；第二次 pass 时只输出第二次内容', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        makeIntakeReply({ risk_level: 'low', next_mode: 'companion' }),
      ],
      streamReplies: [
        ['我永远不会离开你'], // 触发 no_absolute_promise → fail
        ['我听到你了，可以试试给自己倒一杯水慢慢喝。'], // pass
      ],
    });
    const log = makeLogger();
    const ac = new AbortController();

    const events = await collectEvents(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '今天有点难过',
        },
        {
          ai,
          repos: { sessions: mocks.sessions, messages: mocks.messages },
          signal: ac.signal,
          logger: log,
          intakeTimeoutMs: 5000,
        }
      )
    );

    // streamText 应该被调用两次（第一次 + 重试）
    const streamCalls = ai.__calls.filter((c) => c.kind === 'streamText');
    expect(streamCalls).toHaveLength(2);

    // 客户端只看到第二次的内容
    const content = events
      .filter((e): e is { type: 'delta'; content: string } => e.type === 'delta')
      .map((e) => e.content)
      .join('');
    expect(content).not.toContain('永远');
    expect(content).toContain('我听到你了');

    const done = events[events.length - 1];
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.metadata.guard_failed_first).toBeDefined();
      expect(done.metadata.guard_failed_second).toBeUndefined();
    }
  });

  it('重试也 fail 时输出第二次内容并 warn 日志', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        makeIntakeReply({ risk_level: 'low', next_mode: 'companion' }),
      ],
      streamReplies: [
        ['只有我懂你，可以试试今晚早睡'],
        ['我永远不会离开你，可以试试深呼吸'],
      ],
    });
    const log = makeLogger();
    const ac = new AbortController();

    const events = await collectEvents(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '今天有点难过',
        },
        {
          ai,
          repos: { sessions: mocks.sessions, messages: mocks.messages },
          signal: ac.signal,
          logger: log,
          intakeTimeoutMs: 5000,
        }
      )
    );

    expect(log.warn).toHaveBeenCalled();

    const content = events
      .filter((e): e is { type: 'delta'; content: string } => e.type === 'delta')
      .map((e) => e.content)
      .join('');
    // 决策点 #5：输出第二次的内容（含"永远"），不回退到第一次
    expect(content).toContain('永远');

    const done = events[events.length - 1];
    if (done?.type === 'done') {
      expect(done.metadata.guard_failed_first).toBeDefined();
      expect(done.metadata.guard_failed_second).toBeDefined();
      expect(done.metadata.guard_emitted_anyway).toBe(true);
    }
  });
});

describe('orchestrator: abort 行为', () => {
  it('在生成阶段 abort 时写 user 但不写 assistant', async () => {
    const { mocks, sessionId, userId } = await setupSession();

    // 让 streamText 永远挂着，这样我们能在中途 abort
    const ai = createFakeAIClient({
      completeReplies: [
        makeIntakeReply({ risk_level: 'low', next_mode: 'companion' }),
      ],
    });
    // 重写 streamText：返回一个会被 abort 中断的迭代器
    ai.streamText = (): AsyncIterable<string> => ({
      async *[Symbol.asyncIterator]() {
        // 让出几次 microtask，给 ac.abort() 机会触发
        for (let i = 0; i < 100; i++) {
          await new Promise<void>((r) => setTimeout(r, 5));
          if (ac.signal.aborted) {
            const err = new Error('aborted');
            err.name = 'AbortError';
            throw err;
          }
          yield '一';
        }
      },
    });

    const log = makeLogger();
    const ac = new AbortController();

    const gen = orchestrate(
      {
        user_id: userId,
        session_id: sessionId,
        user_text: '随便说点什么',
      },
      {
        ai,
        repos: { sessions: mocks.sessions, messages: mocks.messages },
        signal: ac.signal,
        logger: log,
        intakeTimeoutMs: 5000,
      }
    );

    // 触发 abort 在第 30ms
    setTimeout(() => ac.abort(), 30);

    const events: OrchestratorEvent[] = [];
    try {
      for await (const ev of gen) events.push(ev);
    } catch {
      /* ignore */
    }

    // user 消息应该已写入
    const appendedRoles = mocks.state.appendedMessages.map((m) => m.role);
    expect(appendedRoles).toContain('user');
    // assistant 消息不应被写入
    expect(appendedRoles).not.toContain('assistant');
  });
});

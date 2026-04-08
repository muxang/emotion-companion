/**
 * 智能融合层意图路由测试。
 *
 * 验证 orchestrator 的 Step 3.5 意图层在不同 intent 下：
 *  - request_analysis (low risk) → 触发 analysis_result action
 *  - request_analysis (high risk) → 走 safety，不发 analysis 事件
 *  - create_plan + 明确类型     → 触发 plan_created action
 *  - create_plan + 不明确       → 触发 plan_options action
 *  - checkin + active plan      → 触发 checkin_done action
 *  - checkin + 无 active plan   → 退化到 companion，不发 checkin_done
 */
import { describe, it, expect, vi } from 'vitest';
import './setup.js';
import { createFakeAIClient, makeMockRepos } from './helpers.js';
import { orchestrate } from '../src/orchestrator/index.js';
import type { OrchestratorEvent } from '../src/orchestrator/types.js';
import type {
  ConversationMode,
  RiskLevel,
  UserIntent,
} from '@emotion/shared';

function makeLogger(): {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function intakeJSON(opts: {
  intent: UserIntent;
  emotion_state?: string;
  issue_type?: string;
  risk_level?: RiskLevel;
  next_mode?: ConversationMode;
}): string {
  return JSON.stringify({
    emotion_state: opts.emotion_state ?? 'mixed',
    issue_type: opts.issue_type ?? 'general',
    risk_level: opts.risk_level ?? 'low',
    next_mode: opts.next_mode ?? 'companion',
    confidence: 0.85,
    reasoning: 'test reasoning (must not leak)',
    intent: opts.intent,
    intent_confidence: 0.9,
  });
}

function tongAnalysisJSON(): string {
  return JSON.stringify({
    analysis: '从你描述的事件看，对方的回复节奏与表达温度有明显起伏。',
    evidence: ['三天没回消息', '约见面被推迟两次'],
    risks: ['过度解读单次行为'],
    advice: '可以试试给自己一周时间，先观察再决定。',
    confidence: 0.7,
    tone: 'gentle',
  });
}

async function collect(
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
  const user = await mocks.users.createWithAnonymousId('anon-intent-test');
  const session = await mocks.sessions.create({ user_id: user.id });
  return { mocks, sessionId: session.id, userId: user.id };
}

function findActions(
  events: OrchestratorEvent[]
): Array<Extract<OrchestratorEvent, { type: 'action' }>> {
  return events.filter(
    (e): e is Extract<OrchestratorEvent, { type: 'action' }> =>
      e.type === 'action'
  );
}

describe('orchestrator intent: request_analysis (low risk)', () => {
  it('yields analysis_result action with structured payload', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      // 顺序：safety classifier → emotion-intake → tong-analysis (× 可能两次)
      completeReplies: [
        intakeJSON({ intent: 'request_analysis', risk_level: 'low' }),
        intakeJSON({ intent: 'request_analysis', risk_level: 'low' }),
        tongAnalysisJSON(),
        tongAnalysisJSON(),
      ],
    });
    const ac = new AbortController();
    const events = await collect(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '帮我分析一下他到底是不是喜欢我。他三天没回消息，但前几天约我见面。',
        },
        {
          ai,
          repos: {
            sessions: mocks.sessions,
            messages: mocks.messages,
            recovery: mocks.recovery,
          },
          signal: ac.signal,
          logger: makeLogger(),
          intakeTimeoutMs: 5000,
          skillTimeoutMs: 5000,
          user: { id: userId, memory_enabled: false },
        }
      )
    );

    const meta = events.find((e) => e.type === 'meta');
    expect(meta?.type).toBe('meta');
    if (meta?.type === 'meta') {
      expect(meta.mode).toBe('analysis');
    }

    const actions = findActions(events);
    const analysis = actions.find((a) => a.action_type === 'analysis_result');
    expect(analysis).toBeDefined();
    expect(analysis?.payload).toMatchObject({
      analysis: expect.any(String),
      advice: expect.any(String),
    });
  });
});

describe('orchestrator intent: request_analysis (high risk)', () => {
  it('falls back to safety, no analysis_result action', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        intakeJSON({ intent: 'request_analysis', risk_level: 'high' }),
      ],
    });
    const ac = new AbortController();
    const events = await collect(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '帮我分析一下他到底是不是喜欢我。',
        },
        {
          ai,
          repos: {
            sessions: mocks.sessions,
            messages: mocks.messages,
            recovery: mocks.recovery,
          },
          signal: ac.signal,
          logger: makeLogger(),
          intakeTimeoutMs: 5000,
          skillTimeoutMs: 5000,
          user: { id: userId, memory_enabled: false },
        }
      )
    );

    const meta = events.find((e) => e.type === 'meta');
    if (meta?.type === 'meta') {
      expect(meta.mode).toBe('safety');
    }
    const actions = findActions(events);
    expect(actions.find((a) => a.action_type === 'analysis_result')).toBeUndefined();
  });
});

describe('orchestrator intent: create_plan with explicit type', () => {
  it('creates 7day-breakup plan and yields plan_created action', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        intakeJSON({ intent: 'create_plan', risk_level: 'low' }),
        intakeJSON({ intent: 'create_plan', risk_level: 'low' }),
        // recovery skill 也调用 ai.complete 拿任务
        JSON.stringify({
          day_index: 1,
          task: '今天给自己泡一杯热水，慢慢喝完。',
          reflection_prompt: '今天最让你心里有点动的瞬间是什么？',
          encouragement: '你愿意停下来已经很重要了。',
        }),
      ],
    });
    const ac = new AbortController();
    const events = await collect(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '我想开始7天失恋恢复计划，帮我制定一下。',
        },
        {
          ai,
          repos: {
            sessions: mocks.sessions,
            messages: mocks.messages,
            recovery: mocks.recovery,
          },
          signal: ac.signal,
          logger: makeLogger(),
          intakeTimeoutMs: 5000,
          skillTimeoutMs: 5000,
          user: { id: userId, memory_enabled: false },
        }
      )
    );

    const actions = findActions(events);
    const created = actions.find((a) => a.action_type === 'plan_created');
    expect(created).toBeDefined();
    expect(created?.payload).toMatchObject({
      plan_type: '7day-breakup',
      total_days: 7,
      current_day: 1,
    });

    // 计划真的写库了
    expect(mocks.state.recoveryPlans.size).toBe(1);
  });
});

describe('orchestrator intent: create_plan without explicit type', () => {
  it('yields plan_options action and guidance text', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        intakeJSON({ intent: 'create_plan', risk_level: 'low' }),
      ],
    });
    const ac = new AbortController();
    const events = await collect(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '帮我制定一个计划吧',
        },
        {
          ai,
          repos: {
            sessions: mocks.sessions,
            messages: mocks.messages,
            recovery: mocks.recovery,
          },
          signal: ac.signal,
          logger: makeLogger(),
          intakeTimeoutMs: 5000,
          skillTimeoutMs: 5000,
          user: { id: userId, memory_enabled: false },
        }
      )
    );

    const actions = findActions(events);
    const opts = actions.find((a) => a.action_type === 'plan_options');
    expect(opts).toBeDefined();
    expect(opts?.payload).toMatchObject({
      options: ['7day-breakup', '14day-rumination'],
    });

    // 没有写计划
    expect(mocks.state.recoveryPlans.size).toBe(0);

    // 流式文本包含引导问句
    const text = events
      .filter((e): e is Extract<OrchestratorEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.content)
      .join('');
    expect(text).toContain('走出一段感情');
  });
});

describe('orchestrator intent: checkin with active plan', () => {
  it('completes today checkin and yields checkin_done action', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    // 预先创建一个 active plan
    const plan = await mocks.recovery.createPlan(userId, '7day-breakup');

    const ai = createFakeAIClient({
      completeReplies: [
        intakeJSON({
          intent: 'checkin',
          risk_level: 'low',
          emotion_state: 'sad',
        }),
        intakeJSON({
          intent: 'checkin',
          risk_level: 'low',
          emotion_state: 'sad',
        }),
      ],
    });
    const ac = new AbortController();
    const events = await collect(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '今天的任务我做完了，打个卡',
        },
        {
          ai,
          repos: {
            sessions: mocks.sessions,
            messages: mocks.messages,
            recovery: mocks.recovery,
          },
          signal: ac.signal,
          logger: makeLogger(),
          intakeTimeoutMs: 5000,
          skillTimeoutMs: 5000,
          user: { id: userId, memory_enabled: false },
        }
      )
    );

    const actions = findActions(events);
    const done = actions.find((a) => a.action_type === 'checkin_done');
    expect(done).toBeDefined();
    expect(done?.payload).toMatchObject({
      plan_id: plan.id,
      day_index: 1,
      mood_score: 4, // sad → 4
    });

    // 计划 current_day 推进到 2
    const updated = mocks.state.recoveryPlans.get(plan.id);
    expect(updated?.current_day).toBe(2);
  });
});

describe('orchestrator intent: checkin without active plan', () => {
  it('falls back to companion mode, no checkin_done action', async () => {
    const { mocks, sessionId, userId } = await setupSession();
    const ai = createFakeAIClient({
      completeReplies: [
        intakeJSON({ intent: 'checkin', risk_level: 'low' }),
      ],
      streamReplies: [
        ['今天你已经做了一件不容易的事。可以试试给自己一杯热水。'],
      ],
    });
    const ac = new AbortController();
    const events = await collect(
      orchestrate(
        {
          user_id: userId,
          session_id: sessionId,
          user_text: '今天做了点事，想打个卡',
        },
        {
          ai,
          repos: {
            sessions: mocks.sessions,
            messages: mocks.messages,
            recovery: mocks.recovery,
          },
          signal: ac.signal,
          logger: makeLogger(),
          intakeTimeoutMs: 5000,
          skillTimeoutMs: 5000,
          user: { id: userId, memory_enabled: false },
        }
      )
    );

    const actions = findActions(events);
    expect(actions.find((a) => a.action_type === 'checkin_done')).toBeUndefined();

    const meta = events.find((e) => e.type === 'meta');
    if (meta?.type === 'meta') {
      expect(meta.mode).toBe('companion');
    }
  });
});

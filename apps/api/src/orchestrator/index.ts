/**
 * Orchestrator - CLAUDE.md §8 八步流程
 *
 * Phase 2 实现：
 *  Step 1: emotion-intake skill（非流式 JSON）
 *  Step 2: 风险检查（critical/high → safety）
 *  Step 3: 脆弱状态缓冲
 *  Step 4: 模式路由（companion / safety / placeholder）
 *  Step 5: 跳过（记忆 Phase 5）
 *  Step 6: 调用 skill 收集到 buffer
 *  Step 7: Final Response Guard + 重试一次
 *  Step 8: 写 messages（user 总是写；assistant 仅在未中止时写）
 *  Step 9: 把 buffered text 切片回放为 OrchestratorEvent.delta
 */
import { randomUUID } from 'node:crypto';
import {
  runEmotionIntake,
  type EmotionIntakeInput,
} from '@emotion/skill-emotion-intake';
import { runCompanionResponse } from '@emotion/skill-companion-response';
import { runSafetyTriage } from '@emotion/skill-safety-triage';
import { collectStream } from '@emotion/core-ai';
import { classifyByKeywords } from '@emotion/safety';
import type {
  ConversationMode,
  IntakeResult,
  RiskLevel,
} from '@emotion/shared';
import { decideMode } from './router.js';
import { placeholderStream } from './placeholder.js';
import { replayChunks } from './replay.js';
import { runGuardWithRetry } from './guard-runner.js';
import type {
  IntakeResultPublic,
  OrchestratorDeps,
  OrchestratorEvent,
  OrchestratorInput,
  OrchestratorMeta,
} from './types.js';

const HISTORY_LIMIT = 6;

export async function* orchestrate(
  input: OrchestratorInput,
  deps: OrchestratorDeps
): AsyncGenerator<OrchestratorEvent> {
  const requestId = deps.requestId ?? randomUUID();
  const log = deps.logger;

  // 拉历史（注入 emotion-intake 与 companion 两个 skill 共用）
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  try {
    const recent = await deps.repos.messages.recentBySession(
      input.session_id,
      HISTORY_LIMIT
    );
    history = recent
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  } catch (err) {
    log.warn({ err, requestId }, 'recent history fetch failed');
  }

  // ---------- Step 1: emotion-intake ----------
  const intakeInput: EmotionIntakeInput = {
    user_text: input.user_text,
    recent_history: history,
  };
  let intake: IntakeResult;
  try {
    intake = await runEmotionIntake(intakeInput, {
      ai: deps.ai,
      signal: deps.signal,
      timeoutMs: deps.intakeTimeoutMs,
    });
  } catch (err) {
    log.error({ err, requestId }, 'emotion-intake threw unexpectedly');
    intake = {
      emotion_state: 'mixed',
      issue_type: 'general',
      risk_level: 'low',
      next_mode: 'companion',
      confidence: 0,
      reasoning: 'orchestrator_intake_exception',
    };
  }

  // 关键词兜底：与 intake 风险取较高
  const keywordRisk = classifyByKeywords(input.user_text);

  // ---------- Step 2/3/4: 路由决策 ----------
  let lastAssistantRisk: RiskLevel | null = null;
  try {
    lastAssistantRisk = await deps.repos.messages.lastAssistantRisk(
      input.session_id
    );
  } catch (err) {
    log.warn({ err, requestId }, 'lastAssistantRisk fetch failed');
  }

  const decision = decideMode({
    intake,
    keyword_risk: keywordRisk,
    last_assistant_risk: lastAssistantRisk,
  });

  log.info(
    {
      requestId,
      session_id: input.session_id,
      mode: decision.mode,
      effective_risk: decision.effective_risk,
      reason: decision.reason,
      intake_risk: intake.risk_level,
      keyword_risk: keywordRisk,
    },
    'orchestrator routed'
  );

  // 提前发送 meta 事件（前端可用于状态切换 / 调试）
  yield { type: 'meta', mode: decision.mode, risk_level: decision.effective_risk };

  // 写 user message（总是写，决策点 #4）
  // 即使后续 abort 或失败，user 消息也保留在时间线
  const intakeForDb = stripReasoning(intake);
  let userWritten = false;
  try {
    await deps.repos.messages.append({
      session_id: input.session_id,
      role: 'user',
      content: input.user_text,
      risk_level: decision.effective_risk,
      intake_result: intakeForDb,
    });
    userWritten = true;
  } catch (err) {
    log.error({ err, requestId }, 'failed to persist user message');
  }

  // ---------- Step 6: 收集 skill 输出到 buffer ----------
  let firstText = '';
  let secondTextHolder: { value: string } | null = null;

  const runOnce = async (): Promise<string> => {
    const stream = pickSkillStream(decision.mode, intake, input, history, deps);
    return collectStream(stream, deps.signal);
  };

  try {
    if (decision.mode === 'safety') {
      // safety 走规则，不进 guard / retry
      const triage = runSafetyTriage({ user_text: input.user_text });
      firstText = await collectStream(triage.stream, deps.signal);
    } else {
      firstText = await runOnce();
    }
  } catch (err) {
    if (deps.signal.aborted) {
      log.info({ requestId }, 'orchestrator aborted before guard');
      yield { type: 'error', code: 'ABORTED', message: '请求已中止' };
      return;
    }
    log.error({ err, requestId }, 'skill stream failed');
    yield {
      type: 'error',
      code: 'SKILL_FAILED',
      message: err instanceof Error ? err.message : '生成失败',
    };
    return;
  }

  // ---------- Step 7: Final Response Guard + 重试 ----------
  let guardMeta: {
    firstFailed: string[];
    secondFailed: string[];
    emittedAnyway: boolean;
  } = { firstFailed: [], secondFailed: [], emittedAnyway: false };

  let finalText = firstText;

  if (decision.mode !== 'safety') {
    const guardResult = await runGuardWithRetry({
      firstText,
      risk_level: decision.effective_risk,
      mode: decision.mode,
      regenerate: async () => {
        const second = await runOnce();
        secondTextHolder = { value: second };
        return second;
      },
      logger: log,
    });
    finalText = guardResult.finalText;
    guardMeta = {
      firstFailed: guardResult.firstFailed,
      secondFailed: guardResult.secondFailed,
      emittedAnyway: guardResult.emittedAnyway,
    };
  }
  // 兜底：finalText 为空 → 用 placeholder 文案
  if (finalText.trim().length === 0) {
    finalText =
      '我在这里。如果你愿意，可以慢慢说说现在最想被听到的是什么。';
  }
  void secondTextHolder; // 仅用于调试时观察

  // ---------- Step 9: 回放给客户端 ----------
  // 在中途 abort 时停止回放，且不写 assistant 消息
  let aborted = false;
  for await (const slice of replayChunks(finalText, deps.signal)) {
    if (deps.signal.aborted) {
      aborted = true;
      break;
    }
    yield { type: 'delta', content: slice };
  }
  if (deps.signal.aborted) aborted = true;

  // ---------- Step 8: 写 assistant message（仅未中止）----------
  if (!aborted) {
    try {
      await deps.repos.messages.append({
        session_id: input.session_id,
        role: 'assistant',
        content: finalText,
        risk_level: decision.effective_risk,
        intake_result: intakeForDb,
      });
      // 计数 +2（user + assistant）；user 未写时只 +1
      const delta = userWritten ? 2 : 1;
      await deps.repos.sessions.incrementMessageCount(input.session_id, delta);
    } catch (err) {
      log.error({ err, requestId }, 'failed to persist assistant message');
    }
  } else if (userWritten) {
    // user 写了但 assistant 没写，仍然 +1
    try {
      await deps.repos.sessions.incrementMessageCount(input.session_id, 1);
    } catch (err) {
      log.error({ err, requestId }, 'failed to bump message_count after abort');
    }
  }

  const meta: OrchestratorMeta = {
    request_id: requestId,
    mode: decision.mode,
    risk_level: decision.effective_risk,
    intake: intakeForDb,
    guard_failed_first: guardMeta.firstFailed.length
      ? guardMeta.firstFailed
      : undefined,
    guard_failed_second: guardMeta.secondFailed.length
      ? guardMeta.secondFailed
      : undefined,
    guard_emitted_anyway: guardMeta.emittedAnyway || undefined,
  };

  if (aborted) {
    yield { type: 'error', code: 'ABORTED', message: '请求已中止' };
    return;
  }
  yield { type: 'done', metadata: meta };
}

function pickSkillStream(
  mode: ConversationMode,
  intake: IntakeResult,
  input: OrchestratorInput,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  deps: OrchestratorDeps
): AsyncIterable<string> {
  if (mode === 'companion') {
    return runCompanionResponse(
      {
        user_text: input.user_text,
        emotion_state: intake.emotion_state,
        intake,
        recent_history: history,
      },
      { ai: deps.ai, signal: deps.signal }
    );
  }
  // analysis / coach / recovery → placeholder
  return placeholderStream();
}

/** 把 IntakeResult 中的 reasoning 字段剥离，用于写库与 meta（绝不外露） */
function stripReasoning(intake: IntakeResult): IntakeResultPublic {
  const { reasoning: _reasoning, ...rest } = intake;
  void _reasoning;
  return rest;
}

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
import {
  BlockedByRiskError,
  runTongAnalysis,
} from '@emotion/skill-tong-analysis';
import {
  BlockedByRiskError as CoachBlockedByRiskError,
  runMessageCoach,
} from '@emotion/skill-message-coach';
import { collectStream } from '@emotion/core-ai';
import { classifyByKeywords } from '@emotion/safety';
import type {
  AnalysisResult,
  ConversationMode,
  IntakeResult,
  MessageCoachResult,
  RiskLevel,
} from '@emotion/shared';
import { decideMode } from './router.js';
import { placeholderStream } from './placeholder.js';
import { replayChunks } from './replay.js';
import { runGuardWithRetry } from './guard-runner.js';
import {
  buildAnalysisInputFromIntake,
  formatAnalysisText,
} from './analysis-input.js';
import {
  buildCoachInputFromIntake,
  formatCoachText,
} from './coach-input.js';
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

  let decision = decideMode({
    intake,
    keyword_risk: keywordRisk,
    last_assistant_risk: lastAssistantRisk,
  });

  // ---------- Analysis 预运行 ----------
  // 非流式：先跑一次拿结构化结果，便于：
  //   1. 把 BlockedByRiskError 在 yield meta 之前转成 safety 兜底（第二道防线）
  //   2. 把结构化 JSON 写入 messages.structured_json
  let analysisStructured: AnalysisResult | null = null;
  let analysisInitialText: string | null = null;
  let coachStructured: MessageCoachResult | null = null;
  let coachInitialText: string | null = null;
  if (decision.mode === 'analysis') {
    try {
      const tongInput = buildAnalysisInputFromIntake(intake, input.user_text);
      const result = await runTongAnalysis(tongInput, {
        ai: deps.ai,
        risk_level: decision.effective_risk,
        signal: deps.signal,
        timeoutMs: deps.intakeTimeoutMs,
      });
      analysisStructured = result;
      analysisInitialText = formatAnalysisText(result.analysis, result.advice);
    } catch (err) {
      if (err instanceof BlockedByRiskError) {
        // 第二道防线触发：orchestrator 路由层应已拦截，但仍降级到 safety
        log.warn(
          { requestId, risk_level: err.risk_level },
          'tong-analysis blocked by second-line guard, falling back to safety'
        );
        decision = {
          mode: 'safety',
          effective_risk: decision.effective_risk,
          reason: 'tong_analysis_blocked_fallback',
        };
      } else if (deps.signal.aborted) {
        log.info({ requestId }, 'analysis aborted before meta');
        yield { type: 'error', code: 'ABORTED', message: '请求已中止' };
        return;
      } else {
        // 其他异常：记录后让下游 collectStream 阶段拿到 null → 走兜底文案
        log.error({ err, requestId }, 'tong-analysis unexpected error');
      }
    }
  }

  // ---------- Coach 预运行 ----------
  // 与 analysis 同构：非流式跑一次 message-coach 拿 3 条话术，
  // 拼接为流式文本回放，并把 structured JSON 写入 messages.structured_json。
  if (decision.mode === 'coach') {
    try {
      const coachInput = buildCoachInputFromIntake(intake, input.user_text);
      const result = await runMessageCoach(coachInput, {
        ai: deps.ai,
        risk_level: decision.effective_risk,
        signal: deps.signal,
        timeoutMs: deps.intakeTimeoutMs,
      });
      coachStructured = result;
      coachInitialText = formatCoachText(result);
    } catch (err) {
      if (err instanceof CoachBlockedByRiskError) {
        // 第二道防线触发：路由层应已拦截 high/critical，但仍降级到 safety
        log.warn(
          { requestId, risk_level: err.risk_level },
          'message-coach blocked by second-line guard, falling back to safety'
        );
        decision = {
          mode: 'safety',
          effective_risk: decision.effective_risk,
          reason: 'message_coach_blocked_fallback',
        };
      } else if (deps.signal.aborted) {
        log.info({ requestId }, 'coach aborted before meta');
        yield { type: 'error', code: 'ABORTED', message: '请求已中止' };
        return;
      } else {
        log.error({ err, requestId }, 'message-coach unexpected error');
      }
    }
  }

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

  // analysis 模式的 regenerate：重新跑 runTongAnalysis 并刷新 structured 结果
  const regenerateAnalysis = async (): Promise<string> => {
    const tongInput = buildAnalysisInputFromIntake(intake, input.user_text);
    try {
      const result = await runTongAnalysis(tongInput, {
        ai: deps.ai,
        risk_level: decision.effective_risk,
        signal: deps.signal,
        timeoutMs: deps.intakeTimeoutMs,
      });
      analysisStructured = result;
      return formatAnalysisText(result.analysis, result.advice);
    } catch (err) {
      // 二次失败时不再切 safety（meta 已发出），回退到一段克制的兜底
      log.warn({ err, requestId }, 'tong-analysis regenerate failed');
      return '我没有办法基于现有信息给出足够稳的分析。可以把最近一次让你最在意的具体事件再说说，我们一起从那里看。';
    }
  };

  // coach 模式的 regenerate：重新跑 runMessageCoach 并刷新 structured 结果
  const regenerateCoach = async (): Promise<string> => {
    const coachInput = buildCoachInputFromIntake(intake, input.user_text);
    try {
      const result = await runMessageCoach(coachInput, {
        ai: deps.ai,
        risk_level: decision.effective_risk,
        signal: deps.signal,
        timeoutMs: deps.intakeTimeoutMs,
      });
      coachStructured = result;
      return formatCoachText(result);
    } catch (err) {
      log.warn({ err, requestId }, 'message-coach regenerate failed');
      return '我没办法基于现有信息给出三条稳的话术。可以再补充一下你想表达的核心意思，我们一起把它捋出来。';
    }
  };

  const runOnce = async (): Promise<string> => {
    if (decision.mode === 'analysis') {
      return regenerateAnalysis();
    }
    if (decision.mode === 'coach') {
      return regenerateCoach();
    }
    const stream = pickSkillStream(decision.mode, intake, input, history, deps);
    return collectStream(stream, deps.signal);
  };

  try {
    if (decision.mode === 'safety') {
      // safety 走规则，不进 guard / retry
      const triage = runSafetyTriage({ user_text: input.user_text });
      firstText = await collectStream(triage.stream, deps.signal);
    } else if (decision.mode === 'analysis') {
      // 已在预运行阶段拿到 firstText；若预运行失败（非 Blocked）则现在补跑一次
      firstText =
        analysisInitialText ?? (await regenerateAnalysis());
    } else if (decision.mode === 'coach') {
      // 同 analysis：复用预运行结果，失败则当场补跑一次
      firstText = coachInitialText ?? (await regenerateCoach());
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
        structured_json:
          analysisStructured
            ? (analysisStructured as unknown as Record<string, unknown>)
            : coachStructured
              ? (coachStructured as unknown as Record<string, unknown>)
              : null,
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

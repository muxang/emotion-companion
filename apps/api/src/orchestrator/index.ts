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
import {
  BlockedByRiskError as RecoveryBlockedByRiskError,
  makeSafeDefaultTask,
  runRecoveryPlan,
} from '@emotion/skill-recovery-plan';
import { collectStream } from '@emotion/core-ai';
import { classifyByKeywords, runFullTriage } from '@emotion/safety';
import type {
  AnalysisResult,
  ConversationMode,
  IntakeResult,
  MessageCoachResult,
  RecoveryTask,
  RiskLevel,
  SafetyResponse,
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
import {
  formatRecoveryText,
  NO_ACTIVE_PLAN_TEXT,
} from './recovery-input.js';
import type {
  IntakeResultPublic,
  OrchestratorDeps,
  OrchestratorEvent,
  OrchestratorInput,
  OrchestratorMeta,
} from './types.js';
import type { UserMemory } from '@emotion/shared';

const EMPTY_MEMORY: UserMemory = {
  profile: null,
  entities: [],
  recentSummaries: [],
  recentEvents: [],
};

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

  // ---------- Step 0: Early Safety Triage（Phase 7） ----------
  // 在 emotion-intake 之前先跑一次 full triage（关键词 + AI 二次分类）。
  // 若结果 >= high → 直接走 safety，跳过 emotion-intake，节省一次 AI 调用。
  // AI 失败/超时会在 runFullTriage 内部沉默回退到关键词结果，不抛错。
  let earlyTriage: SafetyResponse | null = null;
  try {
    earlyTriage = await runFullTriage(input.user_text, deps.ai, {
      signal: deps.signal,
      // 内部硬超时 3s，这里复用 intakeTimeoutMs 作为上限保护
      ...(deps.intakeTimeoutMs !== undefined
        ? { timeoutMs: Math.min(3000, deps.intakeTimeoutMs) }
        : {}),
    });
  } catch (err) {
    log.warn({ err, requestId }, 'early triage threw unexpectedly');
    earlyTriage = null;
  }
  const earlyHigh =
    earlyTriage !== null &&
    (earlyTriage.risk_level === 'high' ||
      earlyTriage.risk_level === 'critical');

  // ---------- Step 1: emotion-intake（earlyHigh 时跳过） ----------
  let intake: IntakeResult;
  if (earlyHigh && earlyTriage) {
    // 高风险直通：构造一个最小 intake，跳过 AI 调用
    intake = {
      emotion_state: 'desperate',
      issue_type: 'general',
      risk_level: earlyTriage.risk_level,
      next_mode: 'safety',
      confidence: 1,
      reasoning: 'early_triage_blocked',
    };
  } else {
    const intakeInput: EmotionIntakeInput = {
      user_text: input.user_text,
      recent_history: history,
    };
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
  }

  // 关键词兜底：与 intake 风险取较高
  // earlyTriage 已经包含 AI + 关键词结果，优先用其 risk_level
  const keywordRisk: RiskLevel =
    earlyTriage?.risk_level ?? classifyByKeywords(input.user_text);

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

  // ---------- Step 5: 注入长期记忆 ----------
  // 仅在非 safety 模式 + memory_enabled=true + memory deps 存在时拉记忆
  // 失败仅记 warn，不阻塞主流程
  let memoryContext = '';
  const memoryEnabled = deps.user?.memory_enabled === true;
  if (
    decision.mode !== 'safety' &&
    memoryEnabled &&
    deps.memory &&
    deps.user
  ) {
    try {
      const memory: UserMemory = await deps.memory.getUserMemory(
        deps.user.id,
        memoryEnabled
      );
      memoryContext = deps.memory.formatMemoryContext(memory);
    } catch (err) {
      log.warn({ err, requestId }, 'memory fetch failed');
      memoryContext = '';
    }
  }
  void EMPTY_MEMORY;

  // ---------- Analysis 预运行 ----------
  // 非流式：先跑一次拿结构化结果，便于：
  //   1. 把 BlockedByRiskError 在 yield meta 之前转成 safety 兜底（第二道防线）
  //   2. 把结构化 JSON 写入 messages.structured_json
  let analysisStructured: AnalysisResult | null = null;
  let analysisInitialText: string | null = null;
  let coachStructured: MessageCoachResult | null = null;
  let coachInitialText: string | null = null;
  let recoveryStructured: RecoveryTask | null = null;
  let recoveryInitialText: string | null = null;
  if (decision.mode === 'analysis') {
    try {
      const tongInput = buildAnalysisInputFromIntake(intake, input.user_text);
      if (memoryContext) tongInput.memory_context = memoryContext;
      const result = await runTongAnalysis(tongInput, {
        ai: deps.ai,
        risk_level: decision.effective_risk,
        signal: deps.signal,
        timeoutMs: deps.skillTimeoutMs,
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
      if (memoryContext) coachInput.memory_context = memoryContext;
      const result = await runMessageCoach(coachInput, {
        ai: deps.ai,
        risk_level: decision.effective_risk,
        signal: deps.signal,
        timeoutMs: deps.skillTimeoutMs,
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

  // ---------- Recovery 预运行 ----------
  // 与 analysis/coach 同构：
  //   - 有 recovery repo + 有 user：查 active plan
  //     - 无 active plan → 引导文案
  //     - 有 active plan → runRecoveryPlan 生成今日任务，拼接为流式文本
  //   - 没有 recovery repo（旧测试场景）→ 引导文案
  //   - critical → 第二道防线兜底为 safety
  if (decision.mode === 'recovery') {
    if (deps.repos.recovery && deps.user) {
      try {
        const activePlan = await deps.repos.recovery.getActivePlanByUser(
          deps.user.id
        );
        if (!activePlan) {
          recoveryInitialText = NO_ACTIVE_PLAN_TEXT;
        } else {
          const task = await runRecoveryPlan(
            {
              plan_type: activePlan.plan_type,
              day_index: activePlan.current_day,
            },
            {
              ai: deps.ai,
              risk_level: decision.effective_risk,
              signal: deps.signal,
              timeoutMs: deps.skillTimeoutMs,
            }
          );
          recoveryStructured = task;
          recoveryInitialText = formatRecoveryText(task);
        }
      } catch (err) {
        if (err instanceof RecoveryBlockedByRiskError) {
          log.warn(
            { requestId, risk_level: err.risk_level },
            'recovery-plan blocked by second-line guard, falling back to safety'
          );
          decision = {
            mode: 'safety',
            effective_risk: decision.effective_risk,
            reason: 'recovery_plan_blocked_fallback',
          };
        } else if (deps.signal.aborted) {
          log.info({ requestId }, 'recovery aborted before meta');
          yield { type: 'error', code: 'ABORTED', message: '请求已中止' };
          return;
        } else {
          log.warn({ err, requestId }, 'recovery-plan unexpected error');
          // 兜底：仍然给出一段安全的引导，避免 finalText 为空
          recoveryInitialText = NO_ACTIVE_PLAN_TEXT;
        }
      }
    } else {
      // 无 recovery repo 注入（旧测试 / 无登录用户）
      recoveryInitialText = NO_ACTIVE_PLAN_TEXT;
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
        timeoutMs: deps.skillTimeoutMs,
      });
      analysisStructured = result;
      return formatAnalysisText(result.analysis, result.advice);
    } catch (err) {
      // 二次失败时不再切 safety（meta 已发出），回退到一段克制的兜底
      log.warn({ err, requestId }, 'tong-analysis regenerate failed');
      return '我没有办法基于现有信息给出足够稳的分析。可以把最近一次让你最在意的具体事件再说说，我们一起从那里看。';
    }
  };

  // recovery 模式的 regenerate：重新跑一次 runRecoveryPlan
  // 若没有 active plan / 没有 recovery repo，回退引导文案
  const regenerateRecovery = async (): Promise<string> => {
    if (!deps.repos.recovery || !deps.user) {
      return NO_ACTIVE_PLAN_TEXT;
    }
    try {
      const activePlan = await deps.repos.recovery.getActivePlanByUser(
        deps.user.id
      );
      if (!activePlan) return NO_ACTIVE_PLAN_TEXT;
      const task = await runRecoveryPlan(
        {
          plan_type: activePlan.plan_type,
          day_index: activePlan.current_day,
        },
        {
          ai: deps.ai,
          risk_level: decision.effective_risk,
          signal: deps.signal,
          timeoutMs: deps.skillTimeoutMs,
        }
      );
      recoveryStructured = task;
      return formatRecoveryText(task);
    } catch (err) {
      log.warn({ err, requestId }, 'recovery-plan regenerate failed');
      const fallback = makeSafeDefaultTask(1);
      recoveryStructured = fallback;
      return formatRecoveryText(fallback);
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
        timeoutMs: deps.skillTimeoutMs,
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
    if (decision.mode === 'recovery') {
      return regenerateRecovery();
    }
    const stream = pickSkillStream(
      decision.mode,
      intake,
      input,
      history,
      deps,
      memoryContext
    );
    return collectStream(stream, deps.signal);
  };

  // Phase 7：safety 模式埋点（fire-and-forget）
  if (decision.mode === 'safety') {
    deps.tracker?.track(
      'safety_triggered',
      {
        risk_level: decision.effective_risk,
        request_id: requestId,
        session_id: input.session_id,
      },
      input.user_id
    );
  }

  try {
    if (decision.mode === 'safety') {
      // safety 走规则，不进 guard / retry
      // 优先复用 earlyTriage 的 meta（已包含 AI 二次分类结果），避免重复调用
      let triageMeta: SafetyResponse;
      if (earlyTriage && earlyTriage.safe_mode) {
        triageMeta = earlyTriage;
      } else {
        const triage = await runSafetyTriage({ user_text: input.user_text });
        triageMeta = triage.meta;
      }
      firstText = triageMeta.support_message ?? '';
    } else if (decision.mode === 'analysis') {
      // 已在预运行阶段拿到 firstText；若预运行失败（非 Blocked）则现在补跑一次
      firstText =
        analysisInitialText ?? (await regenerateAnalysis());
    } else if (decision.mode === 'coach') {
      // 同 analysis：复用预运行结果，失败则当场补跑一次
      firstText = coachInitialText ?? (await regenerateCoach());
    } else if (decision.mode === 'recovery') {
      firstText = recoveryInitialText ?? (await regenerateRecovery());
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
              : recoveryStructured
                ? (recoveryStructured as unknown as Record<string, unknown>)
                : null,
      });
      // 计数 +2（user + assistant）；user 未写时只 +1
      const delta = userWritten ? 2 : 1;
      await deps.repos.sessions.incrementMessageCount(input.session_id, delta);

      // ---------- Phase 5: fire-and-forget 异步记忆任务 ----------
      // 双重门禁：memory_enabled + 风险 < high + memory deps 存在
      // 失败仅 warn，不影响响应；不 await
      if (
        deps.memory &&
        deps.user &&
        memoryEnabled &&
        decision.effective_risk !== 'high' &&
        decision.effective_risk !== 'critical' &&
        decision.mode !== 'safety'
      ) {
        const userId = deps.user.id;
        const sessionId = input.session_id;
        const mem = deps.memory;
        void mem
          .generateSessionSummary(sessionId, userId, true)
          .catch((err: unknown) =>
            log.warn({ err, requestId }, 'memory.generateSessionSummary failed')
          );
        void mem
          .extractAndSaveEntities(sessionId, userId, true)
          .catch((err: unknown) =>
            log.warn({ err, requestId }, 'memory.extractAndSaveEntities failed')
          );
      }
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
  deps: OrchestratorDeps,
  memoryContext: string
): AsyncIterable<string> {
  if (mode === 'companion') {
    return runCompanionResponse(
      {
        user_text: input.user_text,
        emotion_state: intake.emotion_state,
        intake,
        recent_history: history,
        ...(memoryContext ? { memory_context: memoryContext } : {}),
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

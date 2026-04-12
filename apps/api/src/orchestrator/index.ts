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
import { collectStream, runFinalResponseGuard } from '@emotion/core-ai';
import { classifyByKeywords, runFullTriage } from '@emotion/safety';
import {
  collectWitnessData,
  detectSessionEnding,
  detectWitnessType,
  formatSummaryCardText,
  generateSummaryCard,
  generateWitnessMessage,
  type WitnessType,
} from '@emotion/memory';
import type {
  AnalysisResult,
  ConversationMode,
  EmotionState,
  IntakeResult,
  MessageCoachResult,
  RecoveryPlanDTO,
  RecoveryPlanType,
  RecoveryTask,
  RiskLevel,
  SafetyResponse,
  UserIntent,
} from '@emotion/shared';
import { decideMode } from './router.js';
import { placeholderStream } from './placeholder.js';
import { replayChunks, sanitizeText } from './replay.js';
import { runGuardWithRetry } from './guard-runner.js';
import {
  buildAnalysisInputFromIntake,
  formatAnalysisText,
} from './analysis-input.js';
import { buildAnalysisInputFromHistory } from './auto-analysis-input.js';
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
    const raw = recent
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // 合并相邻同角色消息（abort 中断后 user 消息写入但 assistant 未写，
    // 会产生连续 user 消息，Anthropic API 要求 user/assistant 必须交替）
    for (const msg of raw) {
      const last = history[history.length - 1];
      if (last && last.role === msg.role) {
        last.content = `${last.content}\n${msg.content}`;
      } else {
        history.push({ ...msg });
      }
    }
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

  // ---------- Step 3.5: 意图融合层 ----------
  // 在 risk < high 的前提下，根据 intake.intent 微调 decision.mode 或注入副作用。
  // 副作用类操作（create_plan / checkin）的执行延后到 meta yield 之后，
  // 并通过 pendingActions 数组顺序 yield。
  type PendingAction = {
    action_type:
      | 'analysis_result'
      | 'plan_created'
      | 'checkin_done'
      | 'plan_options'
      | 'coach_result';
    payload: Record<string, unknown>;
  };
  const pendingActions: PendingAction[] = [];
  /** 来自意图层的强制流式文本：非 null 时跳过对应 skill 调用直接回放 */
  let intentForcedText: string | null = null;

  const isHighOrAbove =
    decision.effective_risk === 'high' ||
    decision.effective_risk === 'critical' ||
    decision.mode === 'safety';

  if (!isHighOrAbove) {
    const intent = readIntent(intake);

    if (intent === 'request_analysis') {
      decision = { ...decision, mode: 'analysis', reason: 'intent_request_analysis' };
    } else if (intent === 'message_coach') {
      decision = { ...decision, mode: 'coach', reason: 'intent_message_coach' };
    } else if (intent === 'create_plan') {
      // 副作用分支：明确类型直接创建；不明确则给 plan_options 引导
      const planType = detectPlanTypeFromText(input.user_text);
      if (planType && deps.repos.recovery && deps.user) {
        try {
          const created = await deps.repos.recovery.createPlan(
            deps.user.id,
            planType
          );
          pendingActions.push({
            action_type: 'plan_created',
            payload: {
              plan_id: created.id,
              plan_type: created.plan_type,
              total_days: created.total_days,
              current_day: created.current_day,
            },
          });
          // 路由到 recovery，让现有预运行接管首日任务生成
          decision = { ...decision, mode: 'recovery', reason: 'intent_create_plan' };
        } catch (err) {
          log.warn({ err, requestId }, 'intent_create_plan: createPlan failed');
        }
      } else {
        // 不明确：给两个选项引导，跳过 skill 调用
        pendingActions.push({
          action_type: 'plan_options',
          payload: {
            options: ['7day-breakup', '14day-rumination'],
          },
        });
        intentForcedText =
          '你是想走出一段感情，还是停止反复内耗？告诉我你想要哪一个，我们明天就可以一起开始第一天。';
        decision = { ...decision, mode: 'companion', reason: 'intent_plan_options' };
      }
    } else if (intent === 'checkin') {
      if (deps.repos.recovery && deps.user) {
        try {
          const activePlan = await deps.repos.recovery.getActivePlanByUser(
            deps.user.id
          );
          if (activePlan) {
            const checkins = await deps.repos.recovery.listCheckinsByPlan(
              activePlan.id
            );
            if (!isCheckedInToday(activePlan, checkins)) {
              const moodScore = inferMoodScore(intake.emotion_state);
              const result = await deps.repos.recovery.completeCheckin(
                activePlan.id,
                deps.user.id,
                activePlan.current_day,
                null,
                moodScore
              );
              if (result && !result.already_done) {
                pendingActions.push({
                  action_type: 'checkin_done',
                  payload: {
                    plan_id: activePlan.id,
                    day_index: result.checkin.day_index,
                    mood_score: moodScore,
                    plan_status: result.plan.status,
                  },
                });
                intentForcedText = `已为你完成第 ${result.checkin.day_index} 天打卡。今天你已经做了一件不容易的事：愿意停下来记录自己。明天我们继续。`;
                decision = {
                  ...decision,
                  mode: 'companion',
                  reason: 'intent_checkin_done',
                };
              }
            }
            // 已打过卡或没动作 → 走默认 companion 流程
          }
          // 无 active plan → 走默认 companion 流程
        } catch (err) {
          log.warn({ err, requestId }, 'intent_checkin failed');
        }
      }
    }
    // view_timeline / chat：不动 decision，走默认流程
  }

  // ---------- 进度提示：intake 完成后根据路由模式告知前端 ----------
  if (decision.mode !== 'safety' && !deps.signal.aborted) {
    const THINKING_MESSAGES: Partial<Record<typeof decision.mode, string>> = {
      companion: '正在组织回复...',
      analysis: '正在分析关系情况...',
      coach: '正在准备话术建议...',
      recovery: '正在查看你的计划...',
    };
    const msg = THINKING_MESSAGES[decision.mode];
    if (msg) yield { type: 'thinking', message: msg };
  }

  // ---------- Step 5: 注入长期记忆 ----------
  // 仅在非 safety 模式 + memory_enabled=true + memory deps 存在时拉记忆
  // 失败仅记 warn，不阻塞主流程
  // 智能融合层：同时把 active plan + 当日打卡状态拼进 extras
  let memoryContext = '';
  let userMemorySnapshot: UserMemory = EMPTY_MEMORY;
  const memoryEnabled = deps.user?.memory_enabled === true;
  if (
    decision.mode !== 'safety' &&
    memoryEnabled &&
    deps.memory &&
    deps.user
  ) {
    try {
      userMemorySnapshot = await deps.memory.getUserMemory(
        deps.user.id,
        memoryEnabled
      );
      // 拼装 extras：active plan + 是否已打卡
      let extras:
        | {
            activePlan?: {
              plan_type: string;
              current_day: number;
              total_days: number;
            };
            checkedInToday?: boolean;
          }
        | undefined;
      if (deps.repos.recovery) {
        try {
          const activePlan = await deps.repos.recovery.getActivePlanByUser(
            deps.user.id
          );
          if (activePlan) {
            const checkins = await deps.repos.recovery.listCheckinsByPlan(
              activePlan.id
            );
            extras = {
              activePlan: {
                plan_type: activePlan.plan_type,
                current_day: activePlan.current_day,
                total_days: activePlan.total_days,
              },
              checkedInToday: isCheckedInToday(activePlan, checkins),
            };
          }
        } catch (err) {
          log.warn({ err, requestId }, 'memory extras (active plan) fetch failed');
        }
      }
      // formatMemoryContext 第二参为可选，旧调用兼容
      const fmt = deps.memory.formatMemoryContext as unknown as (
        m: UserMemory,
        e?: typeof extras
      ) => string;
      memoryContext = fmt(userMemorySnapshot, extras);
    } catch (err) {
      log.warn({ err, requestId }, 'memory fetch failed');
      memoryContext = '';
    }
  }

  // ---------- Analysis 预运行 ----------
  // 非流式：先跑一次拿结构化结果，便于：
  //   1. 把 BlockedByRiskError 在 yield meta 之前转成 safety 兜底（第二道防线）
  //   2. 把结构化 JSON 写入 messages.structured_json
  let analysisStructured: AnalysisResult | null = null;
  let analysisInitialText: string | null = null;
  let coachStructured: MessageCoachResult | null = null;
  let coachInitialText: string | null = null;
  // 当 coach_result 卡片已经承载完整内容时，跳过流式文本回放，避免重复
  let skipTextReplay = false;
  let recoveryStructured: RecoveryTask | null = null;
  let recoveryInitialText: string | null = null;
  if (decision.mode === 'analysis') {
    try {
      // 智能融合层：request_analysis 意图优先用历史构造输入
      const useHistory = readIntent(intake) === 'request_analysis';
      const tongInput = useHistory
        ? buildAnalysisInputFromHistory(
            history,
            userMemorySnapshot,
            input.user_text,
            intake
          )
        : buildAnalysisInputFromIntake(intake, input.user_text);
      if (memoryContext) tongInput.memory_context = memoryContext;
      const result = await runTongAnalysis(tongInput, {
        ai: deps.ai,
        risk_level: decision.effective_risk,
        signal: deps.signal,
        timeoutMs: deps.skillTimeoutMs,
        logger: deps.logger,
      });
      analysisStructured = result;
      analysisInitialText = formatAnalysisText(result.analysis, result.advice);
      // 智能融合层：把结构化结果作为 action 事件透传给前端
      pendingActions.push({
        action_type: 'analysis_result',
        payload: result as unknown as Record<string, unknown>,
      });
      // 与 coach 同构：分析结果已由卡片承载，跳过流式文本回放，避免上方再出现一段重复文字
      skipTextReplay = true;
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
      // 智能融合层：透传话术结构化结果
      pendingActions.push({
        action_type: 'coach_result',
        payload: result as unknown as Record<string, unknown>,
      });
      // 卡片已经承载所有内容，跳过流式文本回放，避免上方再出现一段重复文字
      skipTextReplay = true;
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

  // 智能融合层：先 yield 已就绪的 action 事件（plan_created / plan_options / checkin_done / analysis_result / coach_result）
  // 前端不识别可忽略；前端识别则可在流式文本之前先渲染卡片骨架
  for (const action of pendingActions) {
    yield {
      type: 'action',
      action_type: action.action_type,
      payload: action.payload,
    };
  }

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
        logger: deps.logger,
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
    if (intentForcedText !== null) {
      // 智能融合层：plan_options / checkin_done 等分支已有现成文案
      firstText = intentForcedText;
    } else if (decision.mode === 'safety') {
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

  if (decision.mode !== 'safety' && intentForcedText === null) {
    // 提前检查：若第一次会失败，提示用户正在优化
    const preCheck = runFinalResponseGuard({
      reply: firstText,
      risk_level: decision.effective_risk,
      mode: decision.mode,
    });
    if (!preCheck.passed && !deps.signal.aborted) {
      yield { type: 'thinking', message: '正在优化回复...' };
    }

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
  // 文本清洗：移除前端字体渲染会显示成 ◆◆◆ 的字符（U+FFFD / 私有区 / 装饰 emoji /
  // 不可见控制字符），并压缩多余空行。回放与持久化都使用清洗后的版本。
  finalText = sanitizeText(finalText);
  void secondTextHolder; // 仅用于调试时观察

  // ---------- Step 1.6: AI 见证人系统 ----------
  // 只在 companion 模式 + 非 skipTextReplay + 有 pool + 有 user 时尝试
  // 失败仅 warn，不阻塞主流程
  let witnessMessage: string | null = null;
  let witnessType: WitnessType | null = null;
  if (
    decision.mode === 'companion' &&
    !skipTextReplay &&
    deps.pool &&
    deps.user &&
    !deps.signal.aborted
  ) {
    try {
      log.info(
        { step: '1.6-witness-start', userId: deps.user.id, requestId },
        'witness: collecting data'
      );
      const witnessData = await collectWitnessData(
        deps.pool,
        deps.user.id,
        decision.effective_risk,
        input.user_text // 当前消息还没写入 DB，手动传入
      );
      const detection = detectWitnessType(witnessData);
      log.info(
        {
          step: 'witness-debug',
          requestId,
          userId: deps.user.id,
          totalSessions: witnessData.totalSessions,
          totalMessages: witnessData.totalMessages,
          currentHour: witnessData.currentHour,
          todayAlreadyWitnessed: witnessData.todayAlreadyWitnessed,
          currentRiskLevel: witnessData.currentRiskLevel,
          firstMessage: witnessData.firstMessage?.slice(0, 30) ?? null,
          recentMessagesCount: witnessData.recentMessages.length,
          recentFirst: witnessData.recentMessages[0]?.slice(0, 40) ?? null,
          shouldWitness: detection.shouldWitness,
          witness_type: detection.witness_type,
          firstReturn_condition:
            witnessData.totalMessages >= 1 &&
            witnessData.totalMessages <= 2 &&
            witnessData.firstMessage !== null,
          lateNight_condition:
            witnessData.currentHour >= 23 || witnessData.currentHour <= 3,
        },
        'witness: detection result'
      );
      if (detection.shouldWitness && detection.witness_type) {
        const msg = await generateWitnessMessage(
          detection.witness_type,
          detection.trigger_evidence,
          witnessData,
          deps.ai
        );
        if (msg.length > 0) {
          witnessMessage = msg;
          witnessType = detection.witness_type;
          log.info(
            { requestId, witnessType: detection.witness_type },
            'witness triggered'
          );
        }
      }
    } catch (err) {
      log.warn({ err, requestId }, 'witness system failed (silent skip)');
    }
  }

  // 把见证拼到 finalText 后面
  if (witnessMessage) {
    finalText = `${finalText}\n\n· · ·\n\n${witnessMessage}`;
  }

  // ---------- Step 1.7: 对话收尾小结卡 ----------
  // companion 模式 + 非 skipTextReplay + 用户发了收尾信号 + 有 pool
  if (
    decision.mode === 'companion' &&
    !skipTextReplay &&
    deps.pool &&
    !deps.signal.aborted
  ) {
    try {
      // 取当前会话消息数
      const countRes = await deps.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM messages WHERE session_id = $1`,
        [input.session_id]
      );
      const sessionMsgCount = Number(countRes.rows[0]?.count ?? '0');
      const isEnding = detectSessionEnding(input.user_text, sessionMsgCount);

      if (isEnding) {
        // 取最近 6 条消息 content
        const recentRes = await deps.pool.query<{ content: string }>(
          `SELECT content FROM (
             SELECT content, created_at FROM messages
             WHERE session_id = $1 AND role IN ('user', 'assistant')
             ORDER BY created_at DESC LIMIT 6
           ) sub ORDER BY created_at ASC`,
          [input.session_id]
        );
        const recentTexts = recentRes.rows.map((r) => r.content);
        const card = await generateSummaryCard(
          recentTexts,
          memoryContext,
          deps.ai
        );
        if (card) {
          finalText = `${finalText}\n\n· · ·\n\n${formatSummaryCardText(card)}`;
        }
      }
    } catch (err) {
      log.warn({ err, requestId }, 'summary card generation failed (silent skip)');
    }
  }

  // ---------- Step 9: 回放给客户端 ----------
  // 在中途 abort 时停止回放，且不写 assistant 消息
  let aborted = false;
  if (!skipTextReplay) {
    for await (const slice of replayChunks(finalText, deps.signal)) {
      if (deps.signal.aborted) {
        aborted = true;
        break;
      }
      yield { type: 'delta', content: slice };
    }
  }
  if (deps.signal.aborted) aborted = true;

  // ---------- Step 8: 写 assistant message（仅未中止）----------
  if (!aborted) {
    try {
      // 智能融合层持久化：把首个 pendingAction（analysis_result / plan_created /
       // plan_options / checkin_done / coach_result）打包成 _actionCard 写进
       // structured_json，供前端 hydrateFromDb 时重建富文本卡片。
       const baseStructured: Record<string, unknown> | null =
         analysisStructured
           ? (analysisStructured as unknown as Record<string, unknown>)
           : coachStructured
             ? (coachStructured as unknown as Record<string, unknown>)
             : recoveryStructured
               ? (recoveryStructured as unknown as Record<string, unknown>)
               : null;
       const firstAction = pendingActions[0];
       const witnessMarker = witnessType ? { _witness_type: witnessType } : {};
       const hasAny = baseStructured || firstAction || witnessType;
       const finalStructured: Record<string, unknown> | null = hasAny
         ? {
             ...(baseStructured ?? {}),
             ...(firstAction
               ? {
                   _actionCard: {
                     action_type: firstAction.action_type,
                     payload: firstAction.payload,
                   },
                 }
               : {}),
             ...witnessMarker,
           }
         : null;

      // 跳过文字回放时（analysis / coach），content 字段写入占位符，
      // 真实内容由 structured_json._actionCard 承载，前端按卡片渲染。
      let placeholderContent: string | null = null;
      if (skipTextReplay) {
        if (decision.mode === 'analysis') {
          placeholderContent = '[关系分析结果见上方卡片]';
        } else if (decision.mode === 'coach') {
          placeholderContent = '[话术建议见下方卡片]';
        } else {
          placeholderContent = '[详情见上方卡片]';
        }
      }

      await deps.repos.messages.append({
        session_id: input.session_id,
        role: 'assistant',
        content: placeholderContent ?? finalText,
        risk_level: decision.effective_risk,
        intake_result: intakeForDb,
        structured_json: finalStructured,
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

/**
 * 智能融合层：从 emotion_state 推断打卡心情评分（1-10）。
 * 用户没有明示评分时使用，避免空值入库。
 */
export function inferMoodScore(emotion: EmotionState): number {
  switch (emotion) {
    case 'desperate':
    case 'numb':
      return 2;
    case 'sad':
    case 'anxious':
    case 'angry':
      return 4;
    case 'confused':
    case 'lonely':
      return 5;
    case 'mixed':
      return 6;
    default:
      return 5;
  }
}

/**
 * 智能融合层：从用户原文中识别恢复计划类型。
 * 命中明确关键词才返回；模糊一律 null（走 plan_options 引导）。
 */
export function detectPlanTypeFromText(text: string): RecoveryPlanType | null {
  const t = text || '';
  // 7天失恋恢复
  if (
    t.includes('7天') ||
    t.includes('七天') ||
    t.includes('失恋') ||
    t.includes('走出') ||
    t.includes('分手')
  ) {
    return '7day-breakup';
  }
  // 14天停止内耗
  if (
    t.includes('14天') ||
    t.includes('十四天') ||
    t.includes('内耗') ||
    t.includes('反复想') ||
    t.includes('停止内耗')
  ) {
    return '14day-rumination';
  }
  return null;
}

/**
 * 当日打卡判断：从 checkins 列表里看 plan.current_day 是否已 completed。
 * 这里的"今天"等同于 plan.current_day，符合现有 recovery repo 的语义
 * （current_day 表示用户当前在第几天，未打卡时停在该 day_index）。
 */
export function isCheckedInToday(
  plan: RecoveryPlanDTO,
  checkins: Array<{ day_index: number; completed: boolean }>
): boolean {
  return checkins.some(
    (c) => c.day_index === plan.current_day && c.completed === true
  );
}

/** intent 安全读取：缺省视为 chat */
export function readIntent(intake: IntakeResult): UserIntent {
  return intake.intent ?? 'chat';
}

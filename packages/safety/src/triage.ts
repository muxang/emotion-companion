/**
 * Safety triage 入口。
 *
 * - runKeywordTriage：同步关键词级（Phase 2 兜底，仍保留）
 * - runFullTriage：异步组合关键词 + AI 二次分类（Phase 7）
 *   策略：
 *     1. 先跑关键词
 *     2. 若关键词已 >= high，直接返回（不浪费 token）
 *     3. 否则跑 AI 分类，取两者较高 risk（保守策略）
 *     4. AI 失败/超时 → 沉默回退到关键词结果
 */
import { RISK_LEVEL_ORDER, type RiskLevel, type SafetyResponse } from '@emotion/shared';
import { classifyByKeywords } from './classifier.js';
import {
  runAIClassifier,
  type AIClassifierClient,
  type RunAIClassifierOptions,
} from './ai-classifier.js';
import {
  SAFETY_NEXT_STEP,
  SAFETY_SUPPORT_MESSAGES,
} from './constants.js';

export function runKeywordTriage(userText: string): SafetyResponse {
  const risk = classifyByKeywords(userText);
  return buildSafetyResponse(risk);
}

/**
 * 完整 triage：关键词 + AI 二次分类。
 *
 * @param userText 用户原始输入
 * @param aiClient 可选 AI 客户端；为 undefined 时退化为纯关键词
 * @param options  超时、外部 abort
 */
export async function runFullTriage(
  userText: string,
  aiClient?: AIClassifierClient,
  options: RunAIClassifierOptions = {}
): Promise<SafetyResponse> {
  const keywordRisk = classifyByKeywords(userText);

  // 关键词已命中 high/critical → 直接用，不浪费 token
  if (
    RISK_LEVEL_ORDER[keywordRisk] >= RISK_LEVEL_ORDER['high'] ||
    !aiClient
  ) {
    return buildSafetyResponse(keywordRisk);
  }

  // AI 二次分类（失败静默回退）
  const aiResult = await runAIClassifier(userText, aiClient, options);
  if (!aiResult) {
    return buildSafetyResponse(keywordRisk);
  }

  // 取两者较高（保守策略）
  const merged: RiskLevel =
    RISK_LEVEL_ORDER[aiResult.risk_level] >= RISK_LEVEL_ORDER[keywordRisk]
      ? aiResult.risk_level
      : keywordRisk;

  return buildSafetyResponse(merged);
}

/**
 * 把一个 RiskLevel 映射成完整 SafetyResponse 结构。
 */
function buildSafetyResponse(risk: RiskLevel): SafetyResponse {
  if (risk === 'critical') {
    return {
      risk_level: 'critical',
      safe_mode: true,
      support_message: SAFETY_SUPPORT_MESSAGES.critical,
      suggest_real_help: true,
      block_analysis: true,
      next_step: SAFETY_NEXT_STEP.critical,
    };
  }
  if (risk === 'high') {
    return {
      risk_level: 'high',
      safe_mode: true,
      support_message: SAFETY_SUPPORT_MESSAGES.high,
      suggest_real_help: false,
      block_analysis: true,
      next_step: SAFETY_NEXT_STEP.high,
    };
  }
  // medium / low：返回非 safe_mode 的安全兜底，由 orchestrator 决定不走 safety 分支
  return {
    risk_level: risk === 'medium' ? 'medium' : 'low',
    safe_mode: false,
    support_message: '',
    suggest_real_help: false,
    block_analysis: false,
    next_step: 'continue_safe_chat',
  };
}

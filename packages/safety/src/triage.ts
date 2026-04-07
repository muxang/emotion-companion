/**
 * 同步关键词级 safety triage。
 *
 * 不调 AI，纯规则匹配。Phase 2 用于 critical/high 兜底；
 * 完整 AI 版留到 Phase 7。
 */
import type { SafetyResponse } from '@emotion/shared';
import { classifyByKeywords } from './classifier.js';
import {
  SAFETY_NEXT_STEP,
  SAFETY_SUPPORT_MESSAGES,
} from './constants.js';

export function runKeywordTriage(userText: string): SafetyResponse {
  const risk = classifyByKeywords(userText);

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

  // medium / low 不命中关键词时，仍返回一个非 safe_mode 的安全兜底，
  // 由 orchestrator 决定不走 safety 分支。
  return {
    risk_level: 'low',
    safe_mode: false,
    support_message: '',
    suggest_real_help: false,
    block_analysis: false,
    next_step: 'continue_safe_chat',
  };
}

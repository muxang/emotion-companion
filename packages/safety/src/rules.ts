import type { ConversationMode, RiskLevel } from '@emotion/shared';
import { isAtLeast } from './classifier.js';

/**
 * 根据风险等级决定允许的对话模式。
 * 见 CLAUDE.md §9.2。
 */
export function allowedModes(risk: RiskLevel): ConversationMode[] {
  if (isAtLeast(risk, 'high')) return ['safety'];
  return ['companion', 'analysis', 'coach', 'recovery', 'safety'];
}

export function canRunAnalysis(risk: RiskLevel): boolean {
  return !isAtLeast(risk, 'high');
}

export function canRunCoach(risk: RiskLevel): boolean {
  return !isAtLeast(risk, 'high');
}

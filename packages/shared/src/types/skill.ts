/**
 * 各 Skill 输出结构定义。
 * 见 CLAUDE.md 第七章。
 */

import type { RiskLevel } from './emotion.js';

export interface CompanionResponse {
  reply: string;
  followup_question?: string;
  suggested_action?: string;
  tone: 'warm' | 'rational' | 'direct';
}

export interface AnalysisResult {
  analysis: string;
  evidence: string[];
  risks: string[];
  advice: string;
  confidence: number;
  tone: 'gentle' | 'neutral' | 'direct';
}

export interface SafetyResponse {
  risk_level: RiskLevel;
  safe_mode: boolean;
  support_message: string;
  suggest_real_help: boolean;
  block_analysis: boolean;
  next_step?: 'pause' | 'grounding' | 'external_support' | 'continue_safe_chat';
}

export interface RecoveryTask {
  day_index: number;
  task: string;
  reflection_prompt: string;
  encouragement: string;
}

export interface MessageCoachOption {
  version: string;
  content: string;
  tone: string;
  usage_tip: string;
}

export interface MessageCoachResult {
  options: MessageCoachOption[];
}

/** tong-analysis wrapper 输入：禁止传入原始用户全文 */
export interface TongAnalysisInput {
  user_goal: string;
  relationship_stage: string;
  /** 客观事实列表，不含用户情绪描述 */
  facts: string[];
  user_state: string;
  required_output: Array<'analysis' | 'evidence' | 'risks' | 'advice'>;
}

export type TongAnalysisOutput = AnalysisResult;

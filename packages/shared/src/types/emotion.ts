/**
 * 情绪与路由相关核心类型。
 * 见 CLAUDE.md 第七章。
 */

export type EmotionState =
  | 'sad'
  | 'anxious'
  | 'angry'
  | 'confused'
  | 'lonely'
  | 'numb'
  | 'desperate'
  | 'mixed';

export type IssueType =
  | 'breakup'
  | 'ambiguous'
  | 'cold-violence'
  | 'lost-contact'
  | 'recovery'
  | 'relationship-eval'
  | 'loneliness'
  | 'message-coach'
  | 'general';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ConversationMode =
  | 'companion'
  | 'analysis'
  | 'coach'
  | 'recovery'
  | 'safety';

export interface IntakeResult {
  emotion_state: EmotionState;
  issue_type: IssueType;
  risk_level: RiskLevel;
  next_mode: ConversationMode;
  confidence: number;
  /** 仅内部使用，禁止返回前端或展示给用户 */
  reasoning: string;
}

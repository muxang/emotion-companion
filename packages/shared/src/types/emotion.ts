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

/**
 * 用户意图（智能融合层）。orchestrator 据此在对话中直接执行操作，
 * 用户无需跳转页面。chat 为默认。
 */
export type UserIntent =
  | 'chat'
  | 'request_analysis'
  | 'create_plan'
  | 'checkin'
  | 'view_timeline'
  | 'message_coach';

export interface IntakeResult {
  emotion_state: EmotionState;
  issue_type: IssueType;
  risk_level: RiskLevel;
  next_mode: ConversationMode;
  confidence: number;
  /** 仅内部使用，禁止返回前端或展示给用户 */
  reasoning: string;
  /** 智能融合层意图。可选：旧路径无 intent 时按 'chat' 处理 */
  intent?: UserIntent;
  /** intent 判断置信度 0-1 */
  intent_confidence?: number;
}

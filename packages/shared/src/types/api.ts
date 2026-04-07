/**
 * API 通用响应类型（CLAUDE.md §12.2）。
 */
import type { ConversationMode, RiskLevel } from './emotion.js';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: ApiErrorBody;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** 用户对外可见字段（不含敏感信息） */
export interface UserDTO {
  id: string;
  anonymous_id: string;
  nickname: string | null;
  tone_preference: 'warm' | 'rational' | 'direct';
  memory_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionDTO {
  id: string;
  user_id: string;
  title: string;
  mode: ConversationMode;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessageDTO {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  risk_level: RiskLevel | null;
  created_at: string;
}

export interface SessionDetailDTO extends SessionDTO {
  messages: MessageDTO[];
}

import type {
  ConversationMode,
  IntakeResult,
  RiskLevel,
} from '@emotion/shared';
import type { AIClient } from '@emotion/core-ai';
import type { MessageRepository } from '../db/repositories/messages.js';
import type { SessionRepository } from '../db/repositories/sessions.js';

export interface OrchestratorInput {
  user_id: string;
  session_id: string;
  user_text: string;
}

export interface OrchestratorDeps {
  ai: AIClient;
  repos: {
    sessions: SessionRepository;
    messages: MessageRepository;
  };
  signal: AbortSignal;
  logger: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
  };
  /** 软超时配置 */
  intakeTimeoutMs: number;
  /** 注入便于测试的 requestId（默认 randomUUID） */
  requestId?: string;
}

export interface OrchestratorMeta {
  request_id: string;
  mode: ConversationMode;
  risk_level: RiskLevel;
  intake: IntakeResultPublic | null;
  guard_failed_first?: string[];
  guard_failed_second?: string[];
  guard_emitted_anyway?: boolean;
}

/** 给客户端用的 intake 视图：剥离 reasoning（仅用于日志/重试，不外露） */
export type IntakeResultPublic = Omit<IntakeResult, 'reasoning'>;

export type OrchestratorEvent =
  | { type: 'delta'; content: string }
  | { type: 'meta'; mode: ConversationMode; risk_level: RiskLevel }
  | { type: 'done'; metadata: OrchestratorMeta }
  | { type: 'error'; code: string; message: string };

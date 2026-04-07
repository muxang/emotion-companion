import type {
  ConversationMode,
  IntakeResult,
  RiskLevel,
  UserMemory,
} from '@emotion/shared';
import type { AIClient } from '@emotion/core-ai';
import type { MessageRepository } from '../db/repositories/messages.js';
import type { SessionRepository } from '../db/repositories/sessions.js';
import type { RecoveryRepository } from '../db/repositories/recovery.js';

export interface OrchestratorInput {
  user_id: string;
  session_id: string;
  user_text: string;
}

/**
 * Phase 5 记忆依赖。orchestrator 通过闭包调用，避免 packages/memory
 * 与 apps/api 互相依赖；测试可以注入 mock。
 *
 * 三个方法都必须自行处理 memory_enabled 与高风险跳过。
 */
export interface OrchestratorMemoryDeps {
  getUserMemory: (
    userId: string,
    memoryEnabled: boolean
  ) => Promise<UserMemory>;
  generateSessionSummary: (
    sessionId: string,
    userId: string,
    memoryEnabled: boolean
  ) => Promise<unknown>;
  extractAndSaveEntities: (
    sessionId: string,
    userId: string,
    memoryEnabled: boolean
  ) => Promise<unknown>;
  formatMemoryContext: (memory: UserMemory) => string;
}

export interface OrchestratorDeps {
  ai: AIClient;
  repos: {
    sessions: SessionRepository;
    messages: MessageRepository;
    /** Phase 6：可选恢复计划仓库；缺省时 recovery 模式走通用引导文案 */
    recovery?: RecoveryRepository;
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
  /**
   * Phase 5：当前用户基本信息（含 memory_enabled 开关）。
   * 缺省时按 memory_enabled=false 处理。
   */
  user?: { id: string; memory_enabled: boolean };
  /**
   * Phase 5：记忆依赖（可选，便于现有测试无需 mock memory）。
   * 缺省时 Step 5 跳过、Step 8 后异步任务跳过。
   */
  memory?: OrchestratorMemoryDeps;
  /**
   * Phase 7：可选埋点 tracker，fire-and-forget。
   * 缺省时不埋点（测试环境无需 mock）。
   */
  tracker?: {
    track: (
      eventName: string,
      properties?: Record<string, unknown>,
      userId?: string | null
    ) => void;
  };
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

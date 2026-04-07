/**
 * 内部统一 AI 错误类型，包装上游 SDK 错误。
 */
export type AIErrorCode =
  | 'AI_REQUEST_FAILED'
  | 'AI_TIMEOUT'
  | 'AI_ABORTED'
  | 'AI_MISSING_KEY'
  | 'AI_BAD_RESPONSE';

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    code: AIErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.status = options.status;
    this.cause = options.cause;
  }
}

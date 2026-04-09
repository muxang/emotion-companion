/**
 * core-ai 公共类型：Provider 无关的 AI 调用接口。
 *
 * 所有 Provider 实现（Anthropic / OpenAI-compatible）均实现此接口。
 * Skill、orchestrator、safety 只依赖此接口，不感知具体 Provider。
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AICompleteOptions {
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * 强制 JSON 输出模式（OpenAI-compatible provider 专用）。
   * 设为 true 时 provider 会在 API 请求中加
   * `response_format: { type: 'json_object' }`，
   * 模型被约束只能输出合法 JSON，大幅减少截断和格式错误。
   * Anthropic provider 会忽略此字段。
   */
  jsonMode?: boolean;
}

export interface AIStreamOptions {
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AIClient {
  complete(options: AICompleteOptions): Promise<string>;
  streamText(options: AIStreamOptions): AsyncIterable<string>;
  readonly provider: string;
  readonly model: string;
}

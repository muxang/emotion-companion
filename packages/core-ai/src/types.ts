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

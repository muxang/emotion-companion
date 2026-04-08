/**
 * Anthropic Provider 实现。
 * 从原 client.ts 迁移，实现 AIClient 接口。
 */
import Anthropic from '@anthropic-ai/sdk';
import { AIError } from '../errors.js';
import type { AIClient, AICompleteOptions, AIStreamOptions } from '../types.js';

export interface AnthropicClientConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseURL?: string;
  maxRetries?: number;
  requestTimeoutMs?: number;
}

export class AnthropicClient implements AIClient {
  private readonly anthropic: Anthropic;
  private readonly defaultMaxTokens: number;
  readonly provider = 'anthropic';
  readonly model: string;

  constructor(config: AnthropicClientConfig) {
    if (!config.apiKey) {
      throw new AIError('AI_MISSING_KEY', 'ANTHROPIC_API_KEY 未配置');
    }
    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries ?? 3,
      timeout: config.requestTimeoutMs ?? 120_000,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens;
  }

  async complete(options: AICompleteOptions): Promise<string> {
    const { ac, cleanup } = mergeAbort(options.signal, options.timeoutMs);
    try {
      const res = await this.anthropic.messages.create(
        {
          model: this.model,
          max_tokens: options.maxTokens ?? this.defaultMaxTokens,
          ...(options.system ? { system: options.system } : {}),
          messages: options.messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        },
        { signal: ac.signal }
      );
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } catch (err) {
      throw wrapAnthropicError(err, ac.signal.aborted, options.timeoutMs);
    } finally {
      cleanup();
    }
  }

  streamText(options: AIStreamOptions): AsyncIterable<string> {
    const self = this;
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<string> {
        const stream = self.anthropic.messages.stream(
          {
            model: self.model,
            max_tokens: options.maxTokens ?? self.defaultMaxTokens,
            ...(options.system ? { system: options.system } : {}),
            messages: options.messages
              .filter((m) => m.role !== 'system')
              .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          },
          { signal: options.signal }
        );
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              yield event.delta.text;
            }
          }
        } catch (err) {
          throw wrapAnthropicError(err, options.signal?.aborted ?? false);
        }
      },
    };
  }
}

function mergeAbort(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): { ac: AbortController; cleanup: () => void } {
  const ac = new AbortController();
  const onAbort = (): void => ac.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      ac.abort();
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs && timeoutMs > 0) {
    timer = setTimeout(() => ac.abort(), timeoutMs);
  }
  return {
    ac,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    },
  };
}

function wrapAnthropicError(
  err: unknown,
  aborted: boolean,
  timeoutMs?: number
): AIError {
  if (err instanceof AIError) return err;
  if (aborted) {
    if (timeoutMs && timeoutMs > 0) {
      return new AIError('AI_TIMEOUT', `AI 请求超时（${timeoutMs}ms）`, { cause: err });
    }
    return new AIError('AI_ABORTED', 'AI 请求被中止', { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    let friendly: string;
    if (status === 502 || status === 503 || status === 504) {
      friendly = `AI 服务暂时不可用（${status}），重试几次仍未成功，请稍后再试`;
    } else if (status === 429) {
      friendly = 'AI 服务繁忙（429），请稍后再试';
    } else if (status === 401 || status === 403) {
      friendly = 'AI 凭证或权限异常，请检查 ANTHROPIC_API_KEY / OPENAI_BASE_URL';
    } else {
      const head = (err.message ?? '').split('\n')[0]?.slice(0, 200) ?? '';
      friendly = `Anthropic API 错误（${status ?? 'unknown'}）：${head}`;
    }
    return new AIError('AI_REQUEST_FAILED', friendly, { status, cause: err });
  }
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.split('\n')[0]?.slice(0, 200) ?? raw;
  return new AIError('AI_REQUEST_FAILED', message, { cause: err });
}

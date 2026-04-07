/**
 * Anthropic SDK 包装。
 *
 * - complete()    : 非流式调用，返回完整文本
 * - streamText()  : 流式调用，返回 AsyncIterable<string> 只 yield 文本 delta
 *
 * 所有上游错误统一包装为 AIError。
 */
import Anthropic from '@anthropic-ai/sdk';
import { AIError } from './errors.js';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  system?: string;
  messages: AIMessage[];
  /** 覆盖默认 max_tokens */
  maxTokens?: number;
  signal?: AbortSignal;
  /** 软超时，到期触发 abort */
  timeoutMs?: number;
}

export interface StreamOptions {
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AIClientConfig {
  apiKey: string;
  model: string;
  defaultMaxTokens: number;
  /** 可选：覆盖默认 https://api.anthropic.com，用于代理或私有网关 */
  baseURL?: string;
  /** 单请求最多重试次数（含首次失败），默认 3。SDK 会对 408/409/429/5xx/网络错误自动重试 */
  maxRetries?: number;
  /** 单请求超时（毫秒），默认 60_000 */
  requestTimeoutMs?: number;
}

export class AIClient {
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly defaultMaxTokens: number;

  constructor(config: AIClientConfig) {
    if (!config.apiKey) {
      throw new AIError('AI_MISSING_KEY', 'ANTHROPIC_API_KEY 未配置');
    }
    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
      // 显式开启重试：默认 SDK 是 2 次，这里提到 3 次，对应 408/409/429/5xx/网络抖动
      maxRetries: config.maxRetries ?? 3,
      timeout: config.requestTimeoutMs ?? 60_000,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    this.model = config.model;
    this.defaultMaxTokens = config.defaultMaxTokens;
  }

  getModel(): string {
    return this.model;
  }

  /**
   * 非流式调用。返回 assistant 文本（content blocks 中所有 text 拼接）。
   */
  async complete(options: CompleteOptions): Promise<string> {
    const { ac, cleanup } = mergeAbort(options.signal, options.timeoutMs);
    try {
      const res = await this.anthropic.messages.create(
        {
          model: this.model,
          max_tokens: options.maxTokens ?? this.defaultMaxTokens,
          ...(options.system ? { system: options.system } : {}),
          messages: options.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        { signal: ac.signal }
      );
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return text;
    } catch (err) {
      throw wrapAnthropicError(err, ac.signal.aborted, options.timeoutMs);
    } finally {
      cleanup();
    }
  }

  /**
   * 流式调用。返回 AsyncIterable<string>，每次 yield 一段文本 delta。
   */
  streamText(options: StreamOptions): AsyncIterable<string> {
    const self = this;
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<string> {
        const stream = self.anthropic.messages.stream(
          {
            model: self.model,
            max_tokens: options.maxTokens ?? self.defaultMaxTokens,
            ...(options.system ? { system: options.system } : {}),
            messages: options.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
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

/**
 * 合并外部 signal + 软超时，返回一个统一的 AbortController。
 */
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
      return new AIError('AI_TIMEOUT', `AI 请求超时（${timeoutMs}ms）`, {
        cause: err,
      });
    }
    return new AIError('AI_ABORTED', 'AI 请求被中止', { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    // 上游 5xx 一般是代理 / 网关抖动；给前端更友好的短消息，
    // 完整原文仍通过 cause 保留供日志诊断。
    const status = err.status;
    let friendly: string;
    if (status === 502 || status === 503 || status === 504) {
      friendly = `AI 服务暂时不可用（${status}），重试几次仍未成功，请稍后再试`;
    } else if (status === 429) {
      friendly = 'AI 服务繁忙（429），请稍后再试';
    } else if (status === 401 || status === 403) {
      friendly = 'AI 凭证或权限异常，请检查 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL';
    } else {
      // 截断超长 body，避免把整段 JSON 错误体显示给用户
      const head = (err.message ?? '').split('\n')[0]?.slice(0, 200) ?? '';
      friendly = `Anthropic API 错误（${status ?? 'unknown'}）：${head}`;
    }
    return new AIError('AI_REQUEST_FAILED', friendly, {
      status: status,
      cause: err,
    });
  }
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.split('\n')[0]?.slice(0, 200) ?? raw;
  return new AIError('AI_REQUEST_FAILED', message, { cause: err });
}

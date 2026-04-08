/**
 * OpenAI-compatible Provider 实现。
 *
 * 兼容所有遵循 OpenAI Chat Completions API 的服务：
 * OpenAI / DeepSeek / 通义千问 / 智谱 GLM / 自定义中转
 *
 * 通过 baseURL 区分不同服务，apiKey 使用对应平台的密钥。
 */
import OpenAI from 'openai';
import { AIError } from '../errors.js';
import type { AIClient, AICompleteOptions, AIStreamOptions } from '../types.js';

export interface OpenAICompatibleConfig {
  apiKey: string;
  /** 必填：目标服务的 API 根路径，例如 https://api.deepseek.com/v1 */
  baseURL: string;
  model: string;
  maxTokens: number;
  /** provider 标识，填入 this.provider，便于日志诊断 */
  providerName: string;
  requestTimeoutMs?: number;
}

export class OpenAICompatibleClient implements AIClient {
  private readonly client: OpenAI;
  private readonly defaultMaxTokens: number;
  readonly provider: string;
  readonly model: string;

  constructor(config: OpenAICompatibleConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.requestTimeoutMs ?? 120_000,
      maxRetries: 3,
    });
    this.defaultMaxTokens = config.maxTokens;
    this.provider = config.providerName;
    this.model = config.model;
  }

  async complete(options: AICompleteOptions): Promise<string> {
    const messages = buildMessages(options);
    const { ac, cleanup } = mergeAbort(options.signal, options.timeoutMs);
    try {
      const res = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          max_tokens: options.maxTokens ?? this.defaultMaxTokens,
          stream: false,
        },
        { signal: ac.signal }
      );
      return res.choices[0]?.message?.content ?? '';
    } catch (err) {
      throw wrapOpenAIError(err, ac.signal.aborted, options.timeoutMs);
    } finally {
      cleanup();
    }
  }

  streamText(options: AIStreamOptions): AsyncIterable<string> {
    const self = this;
    const messages = buildMessages(options);
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<string> {
        let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
        try {
          stream = await self.client.chat.completions.create(
            {
              model: self.model,
              messages,
              max_tokens: options.maxTokens ?? self.defaultMaxTokens,
              stream: true,
            },
            { signal: options.signal }
          );
        } catch (err) {
          throw wrapOpenAIError(err, options.signal?.aborted ?? false);
        }
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) yield content;
          }
        } catch (err) {
          throw wrapOpenAIError(err, options.signal?.aborted ?? false);
        }
      },
    };
  }
}

function buildMessages(
  options: AICompleteOptions | AIStreamOptions
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (options.system) {
    result.push({ role: 'system', content: options.system });
  }
  for (const msg of options.messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      result.push({ role: msg.role, content: msg.content });
    }
    // role='system' in messages array is ignored — use options.system instead
  }
  return result;
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

function wrapOpenAIError(
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
  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    let friendly: string;
    if (status === 502 || status === 503 || status === 504) {
      friendly = `AI 服务暂时不可用（${status}），请稍后再试`;
    } else if (status === 429) {
      friendly = 'AI 服务繁忙（429），请稍后再试';
    } else if (status === 401 || status === 403) {
      friendly = 'AI 凭证或权限异常，请检查 OPENAI_API_KEY / OPENAI_BASE_URL';
    } else {
      const head = (err.message ?? '').split('\n')[0]?.slice(0, 200) ?? '';
      friendly = `API 错误（${status ?? 'unknown'}）：${head}`;
    }
    return new AIError('AI_REQUEST_FAILED', friendly, { status, cause: err });
  }
  const raw = err instanceof Error ? err.message : String(err);
  return new AIError('AI_REQUEST_FAILED', raw.split('\n')[0]?.slice(0, 200) ?? raw, { cause: err });
}

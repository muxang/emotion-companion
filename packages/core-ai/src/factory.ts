/**
 * AIClient 工厂。
 *
 * 根据 AI_PROVIDER 环境变量创建对应的 Provider 实现。
 * 调用方（apps/api/src/index.ts）只需传入 env，工厂负责选型和构造。
 *
 * 支持的 Provider：
 *   anthropic  — Anthropic Claude（默认）
 *   openai     — OpenAI GPT 系列
 *   deepseek   — DeepSeek
 *   qwen       — 通义千问（阿里云）
 *   zhipu      — 智谱 GLM
 *   custom     — 完全自定义：需同时提供 OPENAI_API_KEY + OPENAI_BASE_URL
 */
import { AnthropicClient } from './providers/anthropic.js';
import { OpenAICompatibleClient } from './providers/openai-compatible.js';
import type { AIClient } from './types.js';

/** 各 OpenAI-compatible Provider 的默认官方 BASE_URL */
const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
} as const;

type KnownOpenAIProvider = keyof typeof DEFAULT_BASE_URLS;

export interface ProviderConfig {
  AI_PROVIDER: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  /** 覆盖当前 provider 的默认地址（所有 provider 均支持） */
  OPENAI_BASE_URL?: string;
  AI_MODEL: string;
  AI_MAX_TOKENS: number;
  requestTimeoutMs?: number;
}

/**
 * 根据配置创建 AIClient。
 *
 * @throws 当必要的 API Key 或 Base URL 缺失时抛出 Error（启动时失败快速，而非运行时才发现）
 */
export function createAIClient(config: ProviderConfig): AIClient {
  const provider = config.AI_PROVIDER.toLowerCase();

  switch (provider) {
    case 'anthropic':
      if (!config.ANTHROPIC_API_KEY) {
        throw new Error(
          'AI_PROVIDER=anthropic 需要设置 ANTHROPIC_API_KEY'
        );
      }
      return new AnthropicClient({
        apiKey: config.ANTHROPIC_API_KEY,
        model: config.AI_MODEL,
        maxTokens: config.AI_MAX_TOKENS,
        requestTimeoutMs: config.requestTimeoutMs,
        ...(config.OPENAI_BASE_URL ? { baseURL: config.OPENAI_BASE_URL } : {}),
      });

    case 'openai':
    case 'deepseek':
    case 'qwen':
    case 'zhipu': {
      if (!config.OPENAI_API_KEY) {
        throw new Error(
          `AI_PROVIDER=${provider} 需要设置 OPENAI_API_KEY`
        );
      }
      const defaultUrl = DEFAULT_BASE_URLS[provider as KnownOpenAIProvider];
      const baseURL = config.OPENAI_BASE_URL ?? defaultUrl;
      return new OpenAICompatibleClient({
        apiKey: config.OPENAI_API_KEY,
        baseURL,
        model: config.AI_MODEL,
        maxTokens: config.AI_MAX_TOKENS,
        providerName: provider,
        requestTimeoutMs: config.requestTimeoutMs,
      });
    }

    case 'custom':
      if (!config.OPENAI_API_KEY) {
        throw new Error('AI_PROVIDER=custom 需要设置 OPENAI_API_KEY');
      }
      if (!config.OPENAI_BASE_URL) {
        throw new Error('AI_PROVIDER=custom 需要设置 OPENAI_BASE_URL');
      }
      return new OpenAICompatibleClient({
        apiKey: config.OPENAI_API_KEY,
        baseURL: config.OPENAI_BASE_URL,
        model: config.AI_MODEL,
        maxTokens: config.AI_MAX_TOKENS,
        providerName: 'custom',
        requestTimeoutMs: config.requestTimeoutMs,
      });

    default:
      throw new Error(
        `不支持的 AI_PROVIDER: "${config.AI_PROVIDER}"。` +
        `支持的选项：anthropic, openai, deepseek, qwen, zhipu, custom`
      );
  }
}

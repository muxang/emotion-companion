// 公共接口（所有 skill / orchestrator / safety 依赖此接口，不感知具体 Provider）
export type { AIClient, AIMessage, AICompleteOptions, AIStreamOptions } from './types.js';

// 工厂（apps/api/src/index.ts 调用此函数创建 client）
export { createAIClient } from './factory.js';
export type { ProviderConfig } from './factory.js';

// 具体实现（供测试或需要 instanceof 判断时使用）
export { AnthropicClient } from './providers/anthropic.js';
export { OpenAICompatibleClient } from './providers/openai-compatible.js';

// 其他模块
export { collectStream, staticStream } from './stream.js';
export { runFinalResponseGuard } from './guard.js';
export type { GuardContext, GuardCheckResult } from './guard.js';
export { AIError } from './errors.js';
export type { AIErrorCode } from './errors.js';

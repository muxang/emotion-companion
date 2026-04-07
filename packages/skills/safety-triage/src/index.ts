/**
 * Safety Triage Skill
 *
 * Phase 7 起：
 *  - 接受可选 aiClient：有 → runFullTriage（关键词 + AI 二次分类）
 *                       无 → runKeywordTriage（向后兼容）
 *  - 函数变为 async（即使无 aiClient 也返回 Promise，统一接口）
 *
 * 返回结构：
 *  - meta：完整 SafetyResponse 结构（orchestrator 用 block_analysis 等字段）
 *  - stream：把 support_message 包装为 AsyncIterable<string>，统一接口
 */
import {
  runFullTriage,
  runKeywordTriage,
  type AIClassifierClient,
} from '@emotion/safety';
import type { SafetyResponse } from '@emotion/shared';

export interface SafetyTriageInput {
  user_text: string;
}

export interface SafetyTriageOptions {
  /** 可选 AI 客户端，提供则使用 AI 二次分类 */
  aiClient?: AIClassifierClient;
  /** 透传给 runFullTriage 的外部 abort */
  signal?: AbortSignal;
  /** 透传给 runFullTriage 的硬超时（默认 3000ms） */
  timeoutMs?: number;
}

export interface SafetyTriageOutput {
  meta: SafetyResponse;
  stream: AsyncIterable<string>;
}

export async function runSafetyTriage(
  input: SafetyTriageInput,
  options: SafetyTriageOptions = {}
): Promise<SafetyTriageOutput> {
  const meta = options.aiClient
    ? await runFullTriage(input.user_text, options.aiClient, {
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.timeoutMs !== undefined
          ? { timeoutMs: options.timeoutMs }
          : {}),
      })
    : runKeywordTriage(input.user_text);

  return {
    meta,
    stream: {
      async *[Symbol.asyncIterator](): AsyncIterator<string> {
        if (meta.support_message) {
          yield meta.support_message;
        }
      },
    },
  };
}

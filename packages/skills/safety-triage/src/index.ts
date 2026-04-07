/**
 * Safety Triage Skill - Phase 2 实现
 *
 * 同步、不调 AI、关键词级。直接代理到 packages/safety 的 runKeywordTriage。
 * 返回结构包含两部分：
 *  - meta：完整 SafetyResponse 结构（orchestrator 用 block_analysis 等字段）
 *  - stream：把 support_message 包装为 AsyncIterable<string>，统一接口
 */
import { runKeywordTriage } from '@emotion/safety';
import type { SafetyResponse } from '@emotion/shared';

export interface SafetyTriageInput {
  user_text: string;
}

export interface SafetyTriageOutput {
  meta: SafetyResponse;
  stream: AsyncIterable<string>;
}

export function runSafetyTriage(input: SafetyTriageInput): SafetyTriageOutput {
  const meta = runKeywordTriage(input.user_text);
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

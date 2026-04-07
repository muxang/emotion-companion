/**
 * 流式辅助：把任意 AsyncIterable<string> 收集为完整字符串。
 * 用于 orchestrator 在 guard 之前 buffer skill 输出。
 */
import { AIError } from './errors.js';

export async function collectStream(
  source: AsyncIterable<string>,
  signal?: AbortSignal
): Promise<string> {
  let buffer = '';
  for await (const chunk of source) {
    if (signal?.aborted) {
      throw new AIError('AI_ABORTED', '收集流时被中止');
    }
    buffer += chunk;
  }
  return buffer;
}

/**
 * 把字符串包成单 yield 的 AsyncIterable，方便统一接口。
 */
export function staticStream(text: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<string> {
      yield text;
    },
  };
}

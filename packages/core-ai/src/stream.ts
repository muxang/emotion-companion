/**
 * Streaming helpers - Phase 0 placeholder.
 * Phase 1 起将提供与 SSE 兼容的 chunk producer。
 */
export interface StreamChunk {
  type: 'delta' | 'done' | 'error';
  content?: string;
  metadata?: Record<string, unknown>;
}

export async function* placeholderStream(): AsyncGenerator<StreamChunk> {
  yield { type: 'done' };
}

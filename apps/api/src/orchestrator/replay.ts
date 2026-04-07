/**
 * 把 buffer 后的完整文本切成 2-6 字符的片段，按固定节奏 yield。
 * 决策点 #5/#12：使用固定切片，不依赖 Anthropic 原始 chunk 边界。
 */

const CHUNK_MIN = 2;
const CHUNK_MAX = 6;
const CHUNK_DELAY_MS = 12;

function nextChunkSize(): number {
  // [CHUNK_MIN, CHUNK_MAX] 闭区间随机
  return CHUNK_MIN + Math.floor(Math.random() * (CHUNK_MAX - CHUNK_MIN + 1));
}

export async function* replayChunks(
  text: string,
  signal?: AbortSignal,
  delayMs: number = CHUNK_DELAY_MS
): AsyncGenerator<string> {
  let i = 0;
  while (i < text.length) {
    if (signal?.aborted) return;
    const size = nextChunkSize();
    const slice = text.slice(i, i + size);
    i += size;
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    if (signal?.aborted) return;
    yield slice;
  }
}

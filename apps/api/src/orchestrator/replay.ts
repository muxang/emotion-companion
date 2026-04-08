/**
 * 把 buffer 后的完整文本切成 2-6 个字符（Unicode 码点）的片段，按固定节奏 yield。
 *
 * 决策点 #5/#12：使用固定切片，不依赖 Anthropic 原始 chunk 边界。
 *
 * ⚠️ 必须用 [...text]（扩展运算符）按 Unicode 码点迭代，而不能用
 * String.slice(i, i+n)（按 UTF-16 code unit 切）。
 * 原因：emoji 等增补平面字符在 JS 字符串中占 2 个 code unit（surrogate pair），
 * 若 slice 切在 surrogate pair 中间会产生 lone surrogate，
 * JSON.stringify / Node.js Buffer.from 在序列化时会将其替换为 U+FFFD（显示为 ???）。
 */

const CHUNK_MIN = 2;
const CHUNK_MAX = 6;
const CHUNK_DELAY_MS = 12;

function nextChunkSize(): number {
  return CHUNK_MIN + Math.floor(Math.random() * (CHUNK_MAX - CHUNK_MIN + 1));
}

export async function* replayChunks(
  text: string,
  signal?: AbortSignal,
  delayMs: number = CHUNK_DELAY_MS
): AsyncGenerator<string> {
  // [...text] 按 Unicode 码点展开，每个元素是一个合法码点（不会切断 surrogate pair）
  const codePoints = [...text];
  let i = 0;
  while (i < codePoints.length) {
    if (signal?.aborted) return;
    const size = nextChunkSize();
    const slice = codePoints.slice(i, i + size).join('');
    i += size;
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    if (signal?.aborted) return;
    yield slice;
  }
}

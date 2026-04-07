/**
 * companion-response parser - Phase 2
 *
 * 决策点 #6/#13：纯 passthrough + trim + 空内容 fallback。
 * 不做任何 JSON 解析。skill 输出已是自然语言文本。
 */

const EMPTY_FALLBACK =
  '我在这里。我听到你了，慢慢来，不用一次说完。你想先说说现在最让你难受的是什么吗？';

export function finalizeCompanionText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return EMPTY_FALLBACK;
  }
  return trimmed;
}

export { EMPTY_FALLBACK as COMPANION_EMPTY_FALLBACK };

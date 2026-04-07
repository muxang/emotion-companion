/**
 * Phase 2 占位 skill：用于 analysis / coach / recovery 模式。
 *
 * 不调用 AI，返回固定友好文案，引导用户继续聊聊感受。
 * Phase 3+ 会被各自的真实 skill 替换。
 */
const PLACEHOLDER_TEXT =
  '这个功能正在打磨中，我们暂时先聊聊你现在的感受好吗？' +
  '可以告诉我，最近让你最在意的是哪一件事？';

export function placeholderStream(): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<string> {
      yield PLACEHOLDER_TEXT;
    },
  };
}

export { PLACEHOLDER_TEXT };

/**
 * ThinkingBubble — 在 AI 处理期间（等待 delta 到来前）显示的思考状态气泡。
 * 样式与 assistant 消息一致，略透明表示"进行中"。
 */

export interface ThinkingBubbleProps {
  message: string;
}

export function ThinkingBubble({ message }: ThinkingBubbleProps): JSX.Element {
  return (
    <div
      className="flex w-full flex-col items-start"
      data-testid="thinking-bubble"
    >
      <div className="flex max-w-[85%] items-center gap-2 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm leading-relaxed shadow-sm opacity-80">
        {/* 三点依次亮起动画 */}
        <span
          className="inline-flex shrink-0 items-end gap-1"
          aria-hidden="true"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary-400"
            style={{ animation: 'thinking-dot 1.2s ease-in-out infinite', animationDelay: '0ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary-400"
            style={{ animation: 'thinking-dot 1.2s ease-in-out infinite', animationDelay: '400ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary-400"
            style={{ animation: 'thinking-dot 1.2s ease-in-out infinite', animationDelay: '800ms' }}
          />
        </span>
        <span className="text-primary-600/80">{message}</span>
      </div>
    </div>
  );
}

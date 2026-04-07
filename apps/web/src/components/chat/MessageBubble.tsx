import type { ChatViewMessage } from '../../stores/chatStore.js';
import { formatHm } from '../../utils/time.js';
import { parseMiniMarkdown } from '../../utils/markdown.js';

export interface MessageBubbleProps {
  message: ChatViewMessage;
  /** 是否显示时间戳（同一分钟内的连续消息会被去重隐藏） */
  showTimestamp?: boolean;
}

function renderAssistantContent(text: string): JSX.Element[] {
  const nodes = parseMiniMarkdown(text);
  return nodes.map((n, idx) => {
    if (n.type === 'br') return <br key={idx} />;
    if (n.type === 'bold') return <strong key={idx}>{n.value}</strong>;
    return <span key={idx}>{n.value}</span>;
  });
}

export function MessageBubble({
  message,
  showTimestamp = true,
}: MessageBubbleProps): JSX.Element {
  const isUser = message.role === 'user';
  return (
    <div className={`flex w-full flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={[
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-warm-500 text-white'
            : 'border border-warm-100 bg-white text-warm-700',
        ].join(' ')}
      >
        {isUser ? (
          message.content || (message.streaming ? '…' : '')
        ) : message.content ? (
          <>{renderAssistantContent(message.content)}</>
        ) : message.streaming ? (
          '…'
        ) : (
          ''
        )}
        {message.streaming && message.content ? (
          <span className="ml-0.5 inline-block w-1 animate-pulse">▍</span>
        ) : null}
      </div>
      {showTimestamp && message.createdAt ? (
        <time
          data-testid="msg-time"
          className="mt-1 px-1 text-[10px] text-warm-700/40"
          dateTime={message.createdAt}
        >
          {formatHm(message.createdAt)}
        </time>
      ) : null}
    </div>
  );
}

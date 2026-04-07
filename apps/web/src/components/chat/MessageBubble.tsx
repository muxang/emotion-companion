import type { ChatViewMessage } from '../../stores/chatStore.js';

export function MessageBubble({ message }: { message: ChatViewMessage }): JSX.Element {
  const isUser = message.role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-warm-500 text-white'
            : 'bg-white text-warm-700 border border-warm-100',
        ].join(' ')}
      >
        {message.content || (message.streaming ? '…' : '')}
        {message.streaming && message.content ? (
          <span className="ml-0.5 inline-block w-1 animate-pulse">▍</span>
        ) : null}
      </div>
    </div>
  );
}

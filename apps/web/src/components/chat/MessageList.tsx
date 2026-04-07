import { useEffect, useRef } from 'react';
import type { ChatViewMessage } from '../../stores/chatStore.js';
import { MessageBubble } from './MessageBubble.js';

export function MessageList({
  messages,
}: {
  messages: ChatViewMessage[];
}): JSX.Element {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-warm-700/50">
        <p className="text-sm">慢慢说，我在这里。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { ChatViewMessage } from '../../stores/chatStore.js';
import { MessageBubble } from './MessageBubble.js';
import { isSameMinute } from '../../utils/time.js';

export interface MessageListProps {
  messages: ChatViewMessage[];
  /** 当消息为空时显示的占位区（由父组件传入空状态/快捷话题） */
  emptyState?: JSX.Element | null;
}

export function MessageList({
  messages,
  emptyState,
}: MessageListProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // jsdom 不实现 scrollIntoView，使用可选调用避免测试报错
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        {emptyState ?? (
          <p className="text-sm text-warm-700/50">慢慢说,我在这里。</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      {messages.map((m, i) => {
        // 同一分钟内、相同角色的连续消息不重复显示时间戳
        const prev = messages[i - 1];
        const sameMinute =
          prev != null &&
          prev.role === m.role &&
          isSameMinute(prev.createdAt, m.createdAt);
        return (
          <MessageBubble key={m.id} message={m} showTimestamp={!sameMinute} />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from '../src/components/chat/MessageList.js';
import type { ChatViewMessage } from '../src/stores/chatStore.js';

function makeMsg(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  createdAt: string
): ChatViewMessage {
  return { id, role, content, createdAt };
}

describe('<MessageList /> timestamp dedup', () => {
  it('hides timestamp on consecutive same-minute same-role messages', () => {
    const messages: ChatViewMessage[] = [
      makeMsg('1', 'user', 'a', '2026-04-07T10:30:10Z'),
      makeMsg('2', 'user', 'b', '2026-04-07T10:30:40Z'),
      makeMsg('3', 'user', 'c', '2026-04-07T10:31:00Z'),
    ];
    render(<MessageList messages={messages} />);
    const times = screen.getAllByTestId('msg-time');
    // 1st 显示, 2nd 同分钟同角色去重, 3rd 不同分钟显示
    expect(times).toHaveLength(2);
  });

  it('shows timestamp when role changes within same minute', () => {
    const messages: ChatViewMessage[] = [
      makeMsg('1', 'user', 'hi', '2026-04-07T10:30:10Z'),
      makeMsg('2', 'assistant', 'hello', '2026-04-07T10:30:30Z'),
    ];
    render(<MessageList messages={messages} />);
    const times = screen.getAllByTestId('msg-time');
    expect(times).toHaveLength(2);
  });

  it('renders empty state when no messages', () => {
    render(
      <MessageList
        messages={[]}
        emptyState={<div data-testid="empty">空</div>}
      />
    );
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });
});

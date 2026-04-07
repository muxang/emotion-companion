import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/api/sessions.js', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../src/api/stream.js', () => ({
  streamChat: vi.fn(),
}));

import { ChatPage } from '../src/pages/Chat/ChatPage.js';
import { useAuthStore } from '../src/stores/authStore.js';
import { useSessionStore } from '../src/stores/sessionStore.js';
import { useChatStore } from '../src/stores/chatStore.js';

function renderPage(): void {
  render(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>
  );
}

describe('<ChatPage /> empty state quick topics', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authed',
      userId: 'u-1',
      anonymousId: 'anon-1',
      error: null,
    });
    useSessionStore.setState({
      sessions: [],
      currentSessionId: null,
      currentMessages: [],
      loading: false,
      error: null,
    });
    useChatStore.setState({
      messages: [],
      status: 'idle',
      error: null,
      abortController: null,
    });
  });

  it('shows empty state with quick topic buttons when no messages', () => {
    renderPage();
    expect(screen.getByText('今天想聊点什么?')).toBeInTheDocument();
    expect(screen.getAllByTestId('quick-topic')).toHaveLength(3);
  });

  it('clicking a quick topic fills the input', () => {
    renderPage();
    const topics = screen.getAllByTestId('quick-topic');
    fireEvent.click(topics[0]);
    const textarea = screen.getByLabelText('输入消息') as HTMLTextAreaElement;
    expect(textarea.value).toBe(topics[0].textContent ?? '');
  });
});

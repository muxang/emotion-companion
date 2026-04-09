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

describe('<ChatPage /> empty state feature hints', () => {
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

  it('shows empty state with 4 feature hint cards when no messages', () => {
    renderPage();
    expect(screen.getByText('今天想聊点什么?')).toBeInTheDocument();
    expect(screen.getByTestId('feature-hints')).toBeInTheDocument();
    // 四个功能：随时倾诉 / 关系分析 / 恢复计划 / 话术建议
    expect(screen.getByTestId('feature-hint-随时倾诉')).toBeInTheDocument();
    expect(screen.getByTestId('feature-hint-关系分析')).toBeInTheDocument();
    expect(screen.getByTestId('feature-hint-恢复计划')).toBeInTheDocument();
    expect(screen.getByTestId('feature-hint-话术建议')).toBeInTheDocument();
  });

  it('clicking a feature hint card fills the input with its example', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('feature-hint-关系分析'));
    const textarea = screen.getByLabelText('输入消息') as HTMLTextAreaElement;
    expect(textarea.value).toBe('帮我分析一下这段关系');
  });
});

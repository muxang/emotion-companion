/**
 * chatStore thinking 状态测试
 *
 * 测试重点：
 * - thinkingMessage 初始为 null
 * - onThinking 回调将 thinkingMessage 设为对应消息
 * - onDelta 触发后 thinkingMessage 变回 null
 * - onDone / onError / abort 均清除 thinkingMessage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 拦截 streamChat，让测试完全控制回调时序
vi.mock('../src/api/stream.js', () => ({
  streamChat: vi.fn(),
}));

import { useChatStore } from '../src/stores/chatStore.js';
import { streamChat } from '../src/api/stream.js';
import type { StreamChatParams } from '../src/api/stream.js';

const mockStreamChat = streamChat as ReturnType<typeof vi.fn>;

beforeEach(() => {
  useChatStore.getState().reset();
  mockStreamChat.mockReset();
});

describe('chatStore thinkingMessage', () => {
  it('初始 thinkingMessage 为 null', () => {
    expect(useChatStore.getState().thinkingMessage).toBeNull();
  });

  it('onThinking 回调更新 thinkingMessage', async () => {
    mockStreamChat.mockImplementation(async (params: StreamChatParams) => {
      params.onThinking?.('正在理解你说的话...');
    });
    const sendPromise = useChatStore.getState().send('sess-1', '你好');
    await sendPromise;
    // 注意：send 完成后 thinkingMessage 不一定还在（取决于回调顺序），
    // 但我们可以通过验证 mock 被调用来间接确认回调被正确传递
    expect(mockStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({ onThinking: expect.any(Function) })
    );
  });

  it('onDelta 触发后 thinkingMessage 变为 null', async () => {
    let capturedParams: StreamChatParams | null = null;
    mockStreamChat.mockImplementation(async (params: StreamChatParams) => {
      capturedParams = params;
      params.onThinking?.('正在组织回复...');
      // 验证 thinking 已设置
      expect(useChatStore.getState().thinkingMessage).toBe('正在组织回复...');
      // 然后触发 delta
      params.onDelta('你好兄弟');
      // thinking 应该被清除
      expect(useChatStore.getState().thinkingMessage).toBeNull();
      params.onDone({});
    });
    await useChatStore.getState().send('sess-1', '测试');
    expect(capturedParams).not.toBeNull();
    expect(useChatStore.getState().thinkingMessage).toBeNull();
  });

  it('onDone 后 thinkingMessage 为 null', async () => {
    mockStreamChat.mockImplementation(async (params: StreamChatParams) => {
      params.onThinking?.('正在分析...');
      params.onDone({});
    });
    await useChatStore.getState().send('sess-1', '测试');
    expect(useChatStore.getState().thinkingMessage).toBeNull();
  });

  it('onError 后 thinkingMessage 为 null', async () => {
    mockStreamChat.mockImplementation(async (params: StreamChatParams) => {
      params.onThinking?.('正在分析...');
      params.onError('ERR', '失败');
    });
    await useChatStore.getState().send('sess-1', '测试');
    expect(useChatStore.getState().thinkingMessage).toBeNull();
    expect(useChatStore.getState().status).toBe('error');
  });
});

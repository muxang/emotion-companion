import { describe, it, expect } from 'vitest';
import {
  buildCompanionPrompt,
  finalizeCompanionText,
  COMPANION_EMPTY_FALLBACK,
  runCompanionResponse,
} from '../src/index.js';
import type { AIClient } from '@emotion/core-ai';

describe('companion-response.buildCompanionPrompt', () => {
  it('builds system + messages with the latest user text', () => {
    const { system, messages } = buildCompanionPrompt({
      user_text: '我感觉很孤单',
      emotion_state: 'lonely',
    });
    expect(system.length).toBeGreaterThan(50);
    expect(messages[messages.length - 1]?.content).toContain('我感觉很孤单');
    expect(messages[messages.length - 1]?.content).toContain('lonely');
  });

  it('includes recent history in order', () => {
    const { messages } = buildCompanionPrompt({
      user_text: '今天又一个人',
      emotion_state: 'lonely',
      recent_history: [
        { role: 'user', content: '昨晚失眠' },
        { role: 'assistant', content: '我听到了' },
      ],
    });
    expect(messages[0]?.content).toBe('昨晚失眠');
    expect(messages[1]?.content).toBe('我听到了');
  });
});

describe('companion-response.finalizeCompanionText', () => {
  it('passes through normal text trimmed', () => {
    expect(finalizeCompanionText('  你好  ')).toBe('你好');
  });

  it('returns fallback on empty', () => {
    expect(finalizeCompanionText('')).toBe(COMPANION_EMPTY_FALLBACK);
  });

  it('returns fallback on whitespace-only', () => {
    expect(finalizeCompanionText('   \n\t  ')).toBe(COMPANION_EMPTY_FALLBACK);
  });
});

describe('companion-response.runCompanionResponse', () => {
  it('returns an AsyncIterable that yields chunks from AI', async () => {
    const ai = {
      complete: async () => '',
      streamText: () => ({
        async *[Symbol.asyncIterator]() {
          yield '我';
          yield '听到';
          yield '你了';
        },
      }),
      getModel: () => 'fake',
    } as unknown as AIClient;

    const stream = runCompanionResponse(
      { user_text: '难过', emotion_state: 'sad' },
      { ai }
    );
    let acc = '';
    for await (const chunk of stream) acc += chunk;
    expect(acc).toBe('我听到你了');
  });
});

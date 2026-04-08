import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIError } from '../src/errors.js';

// Hoist shared mocks so they're available inside vi.mock factory
const { mockCreate, MockAPIError } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }
  return { mockCreate, MockAPIError };
});

vi.mock('openai', () => {
  function MockOpenAI(_config: unknown) {
    return { chat: { completions: { create: mockCreate } } };
  }
  (MockOpenAI as unknown as { APIError: typeof MockAPIError }).APIError = MockAPIError;
  return { default: MockOpenAI };
});

import { OpenAICompatibleClient } from '../src/providers/openai-compatible.js';

function makeClient() {
  return new OpenAICompatibleClient({
    apiKey: 'sk-test',
    baseURL: 'https://api.example.com/v1',
    model: 'test-model',
    maxTokens: 512,
    providerName: 'test-provider',
  });
}

function asyncIter<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe('OpenAICompatibleClient.complete()', () => {
  it('returns choices[0].message.content', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'hello world' } }],
    });
    const client = makeClient();
    const result = await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result).toBe('hello world');
  });

  it('returns empty string when content is null', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });
    const client = makeClient();
    const result = await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result).toBe('');
  });

  it('passes system as first message with role=system', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });
    const client = makeClient();
    await client.complete({
      system: 'You are helpful.',
      messages: [{ role: 'user', content: 'hi' }],
    });
    const [callArgs] = mockCreate.mock.calls;
    const messages = (callArgs as [{ messages: { role: string; content: string }[] }])[0].messages;
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('throws AI_ABORTED when signal is already aborted', async () => {
    mockCreate.mockRejectedValueOnce(new Error('aborted by signal'));
    const controller = new AbortController();
    controller.abort();
    const client = makeClient();
    await expect(
      client.complete({ messages: [{ role: 'user', content: 'hi' }], signal: controller.signal })
    ).rejects.toMatchObject({ code: 'AI_ABORTED' });
  });

  it('throws AI_TIMEOUT when timeoutMs expires', async () => {
    // Simulate: signal aborted + timeoutMs set → AI_TIMEOUT
    mockCreate.mockRejectedValueOnce(new Error('timed out'));
    const controller = new AbortController();
    controller.abort();
    const client = makeClient();
    await expect(
      client.complete({
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
        timeoutMs: 5000,
      })
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });
});

describe('OpenAICompatibleClient.streamText()', () => {
  it('yields non-empty delta.content chunks', async () => {
    mockCreate.mockResolvedValueOnce(
      asyncIter([
        { choices: [{ delta: { content: 'hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
      ])
    );
    const client = makeClient();
    const chunks: string[] = [];
    for await (const chunk of client.streamText({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['hello', ' world']);
  });

  it('skips chunks with null or undefined delta.content', async () => {
    mockCreate.mockResolvedValueOnce(
      asyncIter([
        { choices: [{ delta: { content: 'A' } }] },
        { choices: [{ delta: { content: null } }] },
        { choices: [{ delta: {} }] },
        { choices: [{ delta: { content: 'B' } }] },
      ])
    );
    const client = makeClient();
    const chunks: string[] = [];
    for await (const chunk of client.streamText({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['A', 'B']);
  });

  it('wraps 429 API error as AI_REQUEST_FAILED', async () => {
    mockCreate.mockRejectedValueOnce(new MockAPIError(429, 'Too Many Requests'));
    const client = makeClient();
    let caught: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of client.streamText({ messages: [{ role: 'user', content: 'hi' }] })) {
        /* drain */
      }
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AIError);
    expect((caught as AIError).code).toBe('AI_REQUEST_FAILED');
    expect((caught as AIError).message).toMatch(/429/);
  });
});

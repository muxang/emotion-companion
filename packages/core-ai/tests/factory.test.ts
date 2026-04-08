import { describe, it, expect } from 'vitest';
import { createAIClient } from '../src/factory.js';
import { AnthropicClient } from '../src/providers/anthropic.js';
import { OpenAICompatibleClient } from '../src/providers/openai-compatible.js';

const BASE = {
  AI_MODEL: 'test-model',
  AI_MAX_TOKENS: 512,
};

describe('createAIClient — provider routing', () => {
  it('anthropic with key → AnthropicClient', () => {
    const client = createAIClient({
      ...BASE,
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-test',
    });
    expect(client).toBeInstanceOf(AnthropicClient);
    expect(client.provider).toBe('anthropic');
    expect(client.model).toBe('test-model');
  });

  it('anthropic without key → throws mentioning ANTHROPIC_API_KEY', () => {
    expect(() =>
      createAIClient({ ...BASE, AI_PROVIDER: 'anthropic' })
    ).toThrow('ANTHROPIC_API_KEY');
  });

  it('openai with key → OpenAICompatibleClient with provider=openai', () => {
    const client = createAIClient({
      ...BASE,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
    expect(client.provider).toBe('openai');
    expect(client.model).toBe('test-model');
  });

  it('openai without key → throws mentioning OPENAI_API_KEY', () => {
    expect(() =>
      createAIClient({ ...BASE, AI_PROVIDER: 'openai' })
    ).toThrow('OPENAI_API_KEY');
  });

  it('deepseek with key → OpenAICompatibleClient with provider=deepseek', () => {
    const client = createAIClient({
      ...BASE,
      AI_PROVIDER: 'deepseek',
      OPENAI_API_KEY: 'sk-ds-test',
    });
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
    expect(client.provider).toBe('deepseek');
  });

  it('deepseek + OPENAI_BASE_URL → uses custom URL instead of default', () => {
    const client = createAIClient({
      ...BASE,
      AI_PROVIDER: 'deepseek',
      OPENAI_API_KEY: 'sk-ds-test',
      OPENAI_BASE_URL: 'https://my-relay.example.com/v1',
    });
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
    expect(client.provider).toBe('deepseek');
  });

  it('qwen with key → OpenAICompatibleClient with provider=qwen', () => {
    const client = createAIClient({
      ...BASE,
      AI_PROVIDER: 'qwen',
      OPENAI_API_KEY: 'sk-qwen-test',
    });
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
    expect(client.provider).toBe('qwen');
  });

  it('zhipu with key → OpenAICompatibleClient with provider=zhipu', () => {
    const client = createAIClient({
      ...BASE,
      AI_PROVIDER: 'zhipu',
      OPENAI_API_KEY: 'sk-zhipu-test',
    });
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
    expect(client.provider).toBe('zhipu');
  });

  it('custom with key + base URL → OpenAICompatibleClient with provider=custom', () => {
    const client = createAIClient({
      ...BASE,
      AI_PROVIDER: 'custom',
      OPENAI_API_KEY: 'sk-custom-test',
      OPENAI_BASE_URL: 'https://my-proxy.example.com/v1',
    });
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
    expect(client.provider).toBe('custom');
  });

  it('custom without OPENAI_BASE_URL → throws mentioning OPENAI_BASE_URL', () => {
    expect(() =>
      createAIClient({
        ...BASE,
        AI_PROVIDER: 'custom',
        OPENAI_API_KEY: 'sk-custom-test',
      })
    ).toThrow('OPENAI_BASE_URL');
  });

  it('unknown provider → throws with provider name in message', () => {
    expect(() =>
      createAIClient({ ...BASE, AI_PROVIDER: 'foobar' })
    ).toThrow('foobar');
  });
});

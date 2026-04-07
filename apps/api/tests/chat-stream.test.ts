import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildSseChunk,
  mockStreamGenerator,
} from '../src/routes/chat-stream.js';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';
import type { SessionDTO } from '@emotion/shared';

describe('chat-stream mockStreamGenerator (unit)', () => {
  it('yields characters one by one with the configured delay', async () => {
    const ac = new AbortController();
    const out: string[] = [];
    const start = Date.now();
    for await (const ch of mockStreamGenerator('abc', 5, ac.signal)) {
      out.push(ch);
    }
    expect(out).toEqual(['a', 'b', 'c']);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15 - 2);
  });

  it('stops when signal is aborted mid-stream', async () => {
    const ac = new AbortController();
    const out: string[] = [];
    const promise = (async () => {
      for await (const ch of mockStreamGenerator('hello-world', 20, ac.signal)) {
        out.push(ch);
      }
    })();
    setTimeout(() => ac.abort(), 30);
    await promise;
    expect(out.length).toBeLessThan('hello-world'.length);
  });
});

describe('chat-stream buildSseChunk (unit)', () => {
  it('formats a delta chunk', () => {
    const c = buildSseChunk('delta', { content: 'x' });
    expect(c).toBe('data: {"type":"delta","content":"x"}\n\n');
  });

  it('formats a done chunk with metadata', () => {
    const c = buildSseChunk('done', { metadata: { request_id: 'r1' } });
    expect(c).toBe('data: {"type":"done","metadata":{"request_id":"r1"}}\n\n');
  });
});

let app: FastifyInstance;
beforeEach(async () => {
  ({ app } = await buildTestApp());
});
afterEach(async () => {
  await app.close();
});

async function login(anonymousId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { anonymous_id: anonymousId },
  });
  return (res.json() as { data: { token: string } }).data.token;
}

describe('POST /api/chat/stream auth & ownership gates', () => {
  it('rejects without bearer token (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        session_id: '00000000-0000-0000-0000-000000000000',
        content: 'hi',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown session (404)', async () => {
    const token = await login('anon-stream-404-test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        session_id: '99999999-9999-9999-9999-999999999999',
        content: 'hi',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects another user session (403)', async () => {
    const tokenA = await login('anon-stream-owner-a');
    const tokenB = await login('anon-stream-owner-b');
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    const sessionId = (created.json() as { data: { session: SessionDTO } })
      .data.session.id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { session_id: sessionId, content: '你好' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects malformed body (422)', async () => {
    const token = await login('anon-stream-bad-body-1');
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      headers: { authorization: `Bearer ${token}` },
      payload: { session_id: 'not-a-uuid', content: '' },
    });
    expect(res.statusCode).toBe(422);
  });
});

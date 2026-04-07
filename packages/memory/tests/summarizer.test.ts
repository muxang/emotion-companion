/**
 * generateSessionSummary 单元测试
 *
 * 重点：
 *   - memory_enabled=false → 跳过
 *   - 任一消息 risk_level=high/critical → 跳过（CLAUDE.md §14.2）
 *   - 上次摘要后无新消息 → 跳过
 *   - 正常路径写入 memory_summaries
 */
import { describe, it, expect, vi } from 'vitest';
import { generateSessionSummary } from '../src/summarizer.js';
import type { AIClient } from '@emotion/core-ai';

interface QueryCall {
  sql: string;
  params: unknown[];
}

function makePoolFromScript(
  responses: Array<{ rows: unknown[] }>
): { pool: any; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  let i = 0;
  const pool = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      const r = responses[i] ?? { rows: [] };
      i++;
      return r;
    },
  };
  return { pool, calls };
}

function fakeAI(text: string): AIClient {
  return {
    complete: vi.fn(async () => text),
  } as unknown as AIClient;
}

describe('generateSessionSummary', () => {
  it('memory_enabled=false 立刻跳过', async () => {
    const { pool, calls } = makePoolFromScript([]);
    const ai = fakeAI('不该被调用');
    const result = await generateSessionSummary(
      { pool, ai },
      'sess-1',
      'user-1',
      false
    );
    expect(result.written).toBe(false);
    expect(result.reason).toBe('memory_disabled');
    expect(calls.length).toBe(0);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('包含 high risk 消息时跳过摘要生成', async () => {
    const now = new Date();
    const { pool } = makePoolFromScript([
      // 第一条 query：拉消息
      {
        rows: [
          { role: 'assistant', content: 'a', risk_level: 'low', created_at: now },
          { role: 'user', content: 'b', risk_level: 'high', created_at: now },
        ],
      },
    ]);
    const ai = fakeAI('不该写');
    const result = await generateSessionSummary(
      { pool, ai },
      'sess-1',
      'user-1',
      true
    );
    expect(result.written).toBe(false);
    expect(result.reason).toBe('high_risk_skipped');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('critical risk 也跳过', async () => {
    const { pool } = makePoolFromScript([
      {
        rows: [
          { role: 'user', content: 'a', risk_level: 'critical', created_at: new Date() },
          { role: 'assistant', content: 'b', risk_level: null, created_at: new Date() },
        ],
      },
    ]);
    const ai = fakeAI('');
    const result = await generateSessionSummary({ pool, ai }, 's', 'u', true);
    expect(result.written).toBe(false);
    expect(result.reason).toBe('high_risk_skipped');
  });

  it('消息少于 2 条 → 跳过', async () => {
    const { pool } = makePoolFromScript([
      { rows: [{ role: 'user', content: 'hi', risk_level: null, created_at: new Date() }] },
    ]);
    const ai = fakeAI('');
    const result = await generateSessionSummary({ pool, ai }, 's', 'u', true);
    expect(result.reason).toBe('too_few_messages');
  });

  it('上次摘要时间晚于最新消息 → 跳过', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-01-02T00:00:00Z');
    const { pool } = makePoolFromScript([
      {
        rows: [
          { role: 'user', content: 'a', risk_level: 'low', created_at: old },
          { role: 'assistant', content: 'b', risk_level: 'low', created_at: old },
        ],
      },
      // last summary newer than messages
      { rows: [{ created_at: newer }] },
    ]);
    const ai = fakeAI('');
    const result = await generateSessionSummary({ pool, ai }, 's', 'u', true);
    expect(result.written).toBe(false);
    expect(result.reason).toBe('no_new_messages');
  });

  it('正常路径写入 memory_summaries', async () => {
    const t = new Date();
    const { pool, calls } = makePoolFromScript([
      // messages
      {
        rows: [
          { role: 'user', content: '我和前任刚分手', risk_level: 'low', created_at: t },
          { role: 'assistant', content: '我听到了', risk_level: 'low', created_at: t },
        ],
      },
      // last summary lookup → 无
      { rows: [] },
      // insert
      { rows: [] },
    ]);
    const summaryText =
      '本次会话的核心议题是用户最近的分手。客观事实是用户与前任正式结束了关系。' +
      '用户的状态从困惑走向初步接受。建议接受情况：用户接住了"今晚先把灯调暗、写两行字"的小动作。';
    const ai = fakeAI(summaryText);
    const result = await generateSessionSummary({ pool, ai }, 'sess-1', 'user-1', true);
    expect(result.written).toBe(true);
    expect(ai.complete).toHaveBeenCalledOnce();
    const insertCall = calls[2]!;
    expect(insertCall.sql).toMatch(/INSERT INTO memory_summaries/);
    expect(insertCall.params[0]).toBe('user-1');
    expect(insertCall.params[1]).toBe('sess-1');
  });
});

/**
 * short-term.getRecentMessages 单元测试
 *
 * 用 fake Pool（仅实现 query），断言：
 *   - SQL 包含正确的过滤与排序
 *   - 返回值为正序、字段精确为 {role, content}
 *   - limit 被向下传递
 */
import { describe, it, expect } from 'vitest';
import { getRecentMessages } from '../src/short-term.js';

interface FakePoolCall {
  sql: string;
  params: unknown[];
}

function makeFakePool(rows: Array<{ role: string; content: string }>): {
  pool: Parameters<typeof getRecentMessages>[0];
  calls: FakePoolCall[];
} {
  const calls: FakePoolCall[] = [];
  const pool = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return { rows };
    },
  } as unknown as Parameters<typeof getRecentMessages>[0];
  return { pool, calls };
}

describe('getRecentMessages', () => {
  it('返回 {role, content}，过滤掉 system', async () => {
    const { pool } = makeFakePool([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '我在' },
    ]);
    const out = await getRecentMessages(pool, 'sess-1', 6);
    expect(out).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '我在' },
    ]);
  });

  it('SQL 中包含 role IN(user,assistant) 与 LIMIT 参数', async () => {
    const { pool, calls } = makeFakePool([]);
    await getRecentMessages(pool, 'sess-1', 4);
    expect(calls.length).toBe(1);
    expect(calls[0]!.sql).toMatch(/role IN \('user', 'assistant'\)/);
    expect(calls[0]!.sql).toMatch(/ORDER BY created_at DESC/);
    expect(calls[0]!.sql).toMatch(/ORDER BY created_at ASC/);
    expect(calls[0]!.params).toEqual(['sess-1', 4]);
  });

  it('limit 被夹到 [1, 100] 范围', async () => {
    const { pool, calls } = makeFakePool([]);
    await getRecentMessages(pool, 'sess-1', 0);
    await getRecentMessages(pool, 'sess-1', 999);
    expect(calls[0]!.params[1]).toBe(1);
    expect(calls[1]!.params[1]).toBe(100);
  });

  it('默认 limit 为 6', async () => {
    const { pool, calls } = makeFakePool([]);
    await getRecentMessages(pool, 'sess-1');
    expect(calls[0]!.params[1]).toBe(6);
  });

  it('丢掉 system 行（防御性过滤）', async () => {
    const { pool } = makeFakePool([
      { role: 'system', content: '应被过滤' },
      { role: 'user', content: '保留' },
    ]);
    const out = await getRecentMessages(pool, 'sess-1');
    expect(out).toEqual([{ role: 'user', content: '保留' }]);
  });
});

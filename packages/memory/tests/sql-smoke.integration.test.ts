/**
 * SQL smoke 集成测试 - Phase 7+
 *
 * 目的：在真实 Postgres 上跑一遍 packages/memory + apps/api 引入的所有 join SQL，
 * 单元测试抓不到的 semantic 错误（例如「ambiguous column reference」、不存在的列、
 * 错误的 jsonb 操作符）会在这里第一时间暴露。
 *
 * 触发条件：环境变量 TEST_DATABASE_URL 必须指向一个已经跑过 schema migration 的库。
 *   - 没设：整个 describe 走 it.skip，CI 不会因此变红
 *   - 已设：用一个绝对不存在的 user_id 跑每条 SQL，验证只是「无结果」而非「报错」
 *
 * 不写数据、不依赖夹具数据，因此可以重复跑、可以打到 staging / 本地任何 DB。
 *
 * 跑法：
 *   $env:TEST_DATABASE_URL = "postgres://..."
 *   pnpm --filter @emotion/memory run test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { getEmotionTrend } from '../src/emotion-trend.js';

const { Pool } = pg;

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
// 任意一个不会命中真实用户的 UUID。所有 SELECT 应该都返回空集，
// 不会写也不会改任何数据。
const FAKE_USER_ID = '00000000-0000-0000-0000-000000000000';

// 没配 TEST_DATABASE_URL 时整个 suite skip，开发者本地不影响默认 test 流程
const maybeDescribe = TEST_DATABASE_URL ? describe : describe.skip;

maybeDescribe('SQL smoke (real Postgres) - 验证 join 查询无 semantic 错误', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new Pool({
      connectionString: TEST_DATABASE_URL,
      ssl: process.env.TEST_DATABASE_SSL === '1'
        ? { rejectUnauthorized: false }
        : undefined,
      max: 2,
      idleTimeoutMillis: 5_000,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('getEmotionTrend(packages/memory): 不抛 ambiguous column / 表不存在', async () => {
    // 之前这里漏写 SELECT 列前缀，messages 和 sessions 的 created_at 同名导致
    // 「column reference 'created_at' is ambiguous」42702。
    const trend = await getEmotionTrend(pool, FAKE_USER_ID, 7);
    // 数据点 < 3 → null
    expect(trend).toBeNull();
  });

  it('getEmotionTrend: days 边界值 1 / 90 都能正常 parse', async () => {
    expect(await getEmotionTrend(pool, FAKE_USER_ID, 1)).toBeNull();
    expect(await getEmotionTrend(pool, FAKE_USER_ID, 90)).toBeNull();
  });

  it('hasCaredToday SQL: structured_json ? 操作符 + date_trunc 在真实 PG 通过', async () => {
    // 用与 apps/api/src/index.ts memoryDeps.hasCaredToday 完全一致的 SQL
    const res = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE s.user_id = $1
           AND m.role = 'assistant'
           AND m.structured_json ? '_care_type'
           AND m.created_at >= date_trunc('day', NOW())
       ) AS exists`,
      [FAKE_USER_ID]
    );
    expect(res.rows[0]?.exists).toBe(false);
  });

  it('getLastUserMessageAt SQL: 带与不带 excludeSessionId 都能解析', async () => {
    // 不带 excludeSessionId
    const r1 = await pool.query<{ created_at: Date }>(
      `SELECT m.created_at
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1
         AND m.role = 'user'
       ORDER BY m.created_at DESC LIMIT 1`,
      [FAKE_USER_ID]
    );
    expect(r1.rows.length).toBe(0);

    // 带 excludeSessionId
    const fakeSessionId = '00000000-0000-0000-0000-000000000001';
    const r2 = await pool.query<{ created_at: Date }>(
      `SELECT m.created_at
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1
         AND m.role = 'user'
         AND m.session_id <> $2
       ORDER BY m.created_at DESC LIMIT 1`,
      [FAKE_USER_ID, fakeSessionId]
    );
    expect(r2.rows.length).toBe(0);
  });

  it('isFirstMessageToday SQL: COUNT 聚合 + date_trunc 在真实 PG 通过', async () => {
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1
         AND m.role = 'user'
         AND m.created_at >= date_trunc('day', NOW())`,
      [FAKE_USER_ID]
    );
    expect(res.rows[0]?.count).toBe('0');
  });
});

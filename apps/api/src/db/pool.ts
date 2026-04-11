import pg from 'pg';
import { loadEnv } from '../config/env.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const env = loadEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: 20,
    // 空闲超时：Supabase / 云端 PG 会在 ~60-120s 后单方面杀空闲连接，
    // Node 侧不知道连接已死，下次查询会 ECONNRESET。
    // 把空闲超时设短（20s），让 Pool 主动关掉闲置连接，下次按需重建。
    idleTimeoutMillis: 20_000,
    // 连接生命周期上限：即使一直在用也不超过 5 分钟，定期换新。
    // 防止长寿命连接被服务端防火墙 / LB 静默切断。
    maxLifetimeMillis: 5 * 60 * 1000,
    // 获取连接超时：默认无超时会永远卡住；设 5s 快速失败。
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] unexpected pool error:', err);
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

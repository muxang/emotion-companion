/**
 * 极简迁移 runner。
 * 用法：pnpm --filter api run db:migrate
 *
 * 行为：
 *  1. 确保 _migrations 表存在
 *  2. 列出 db/migrations/*.sql 按文件名排序
 *  3. 跳过已应用的，未应用的在事务中执行并记录
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function ensureMigrationsTable(client: import('pg').PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getApplied(client: import('pg').PoolClient): Promise<Set<string>> {
  const res = await client.query<{ filename: string }>(
    'SELECT filename FROM _migrations'
  );
  return new Set(res.rows.map((r) => r.filename));
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function main(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const files = listMigrationFiles();

    if (files.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[migrate] no migration files found');
      return;
    }

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        // eslint-disable-next-line no-console
        console.log(`[migrate] skip   ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`[migrate] apply  ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `[migrate] failed on ${file}: ${(err as Error).message}`
        );
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[migrate] done. applied ${appliedCount} new migration(s).`);
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

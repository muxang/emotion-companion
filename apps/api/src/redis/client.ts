/**
 * Redis 客户端（Phase 7）
 *
 * 设计要点：
 * - 用 ioredis 建立真实连接（@fastify/rate-limit 只接受 ioredis 兼容实例）。
 * - 启动不阻塞：若 REDIS_URL 未配置或首次连接失败，进入 disabled 状态，
 *   下游限流会自动降级为内存 store，主流程不中断。
 * - 只暴露一个单例 getRedis() 与 closeRedis() / getRedisStatus()，
 *   避免各模块重复连接。
 */
import IORedis, { type Redis } from 'ioredis';
import { loadEnv } from '../config/env.js';

export type RedisStatus = 'ok' | 'error' | 'disabled';

let client: Redis | null = null;
let status: RedisStatus = 'disabled';
let initialized = false;

/**
 * 返回当前 Redis 实例。若未配置或连接失败则返回 null（disabled 状态）。
 * 第一次调用会尝试建立连接，失败时记录日志并降级。
 */
export function getRedis(): Redis | null {
  if (initialized) return client;
  initialized = true;

  const env = loadEnv();
  const url = env.REDIS_URL?.trim();
  if (!url) {
    status = 'disabled';
    // eslint-disable-next-line no-console
    console.warn('[redis] REDIS_URL not configured, running without Redis (rate-limit will use in-memory store)');
    return null;
  }

  try {
    const redis = new IORedis(url, {
      // 启动阶段不阻塞：失败走错误事件，主流程继续
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // 必须为 true：连接握手期间命令排队等待 ready，
      // 否则会抛 "Stream isn't writeable and enableOfflineQueue options is false"，
      // 这会让 @fastify/rate-limit 的第一个请求直接 500。
      enableOfflineQueue: true,
      connectTimeout: 5_000,
      // 默认 retryStrategy：指数退避，最多重试 5 次后停手
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2_000)),
    });

    redis.on('ready', () => {
      status = 'ok';
      // eslint-disable-next-line no-console
      console.info('[redis] connected');
    });

    redis.on('error', (err: Error) => {
      status = 'error';
      // eslint-disable-next-line no-console
      console.warn('[redis] error:', err.message);
    });

    redis.on('end', () => {
      if (status !== 'disabled') status = 'error';
    });

    client = redis;
    return client;
  } catch (err) {
    status = 'disabled';
    // eslint-disable-next-line no-console
    console.warn('[redis] init failed, falling back to disabled:', (err as Error).message);
    client = null;
    return null;
  }
}

/** 返回当前连接状态（供 /health 与日志用）。 */
export function getRedisStatus(): RedisStatus {
  if (!initialized) return 'disabled';
  return status;
}

/**
 * 启动时调用：在 timeoutMs 内确认 redis 是否真的可用。
 *
 * 返回 'ok'      → 已连接，rate-limit 可以安全使用
 * 返回 'error'   → 已配置但连不上，调用方应降级到内存 store
 * 返回 'disabled'→ 未配置 REDIS_URL
 *
 * 即便后续 redis 中途断线，rate-limit 也会因 ioredis 自带的重连和
 * enableOfflineQueue 排队继续工作，不会让请求 500。
 */
export async function awaitRedisReady(timeoutMs = 2_000): Promise<RedisStatus> {
  const r = getRedis();
  if (!r) return 'disabled';

  // 如果 ready 事件已经触发，状态会变成 'ok'，可以直接 ping 校验
  // 否则等到 ready 或 error，最多 timeoutMs
  if (status !== 'ok') {
    const reachable = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (v: boolean): void => {
        if (settled) return;
        settled = true;
        r.off('ready', onReady);
        r.off('error', onError);
        clearTimeout(timer);
        resolve(v);
      };
      const onReady = (): void => finish(true);
      const onError = (): void => finish(false);
      r.once('ready', onReady);
      r.once('error', onError);
      const timer = setTimeout(() => finish(false), timeoutMs);
    });
    if (!reachable) {
      status = 'error';
      // eslint-disable-next-line no-console
      console.warn(
        `[redis] not ready within ${timeoutMs}ms, falling back to in-memory store`
      );
      return 'error';
    }
  }

  // 再 ping 一下确认 RTT 健康
  try {
    const pong = await r.ping();
    status = pong === 'PONG' ? 'ok' : 'error';
    return status;
  } catch (err) {
    status = 'error';
    // eslint-disable-next-line no-console
    console.warn('[redis] ping failed at startup:', (err as Error).message);
    return 'error';
  }
}

/**
 * 主动 ping 一次。用于 /health 深度检查。
 * 若 Redis 未启用，直接返回 'disabled'。
 */
export async function pingRedis(): Promise<RedisStatus> {
  const r = getRedis();
  if (!r) return 'disabled';
  try {
    const res = await r.ping();
    const ok = res === 'PONG';
    status = ok ? 'ok' : 'error';
    return status;
  } catch {
    status = 'error';
    return 'error';
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
    status = 'disabled';
    initialized = false;
  }
}

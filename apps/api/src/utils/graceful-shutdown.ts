/**
 * Phase 7：Graceful shutdown
 *
 * 监听 SIGTERM / SIGINT：
 *  1. 调用 app.close() 让 Fastify 停止接收新请求、等待进行中的请求
 *  2. 最多等 SHUTDOWN_TIMEOUT_MS（默认 30s），超时强制退出，避免卡住容器
 *  3. 关闭数据库连接池与 Redis 连接
 *  4. 退出码 0（正常）/ 1（失败）
 *
 * 只注册一次，重复信号直接忽略。
 */
import type { FastifyInstance } from 'fastify';

export interface GracefulShutdownDeps {
  closePool: () => Promise<void>;
  closeRedis: () => Promise<void>;
  /** 可选：等待 fastify 关闭的最长时间（毫秒），默认 30 秒 */
  timeoutMs?: number;
}

export function registerGracefulShutdown(
  app: FastifyInstance,
  deps: GracefulShutdownDeps
): void {
  const timeoutMs = deps.timeoutMs ?? 30_000;
  let shuttingDown = false;

  const handle = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      app.log.warn({ signal }, 'shutdown already in progress, ignoring');
      return;
    }
    shuttingDown = true;
    app.log.info({ signal, timeoutMs }, 'graceful shutdown: begin');

    const forceExit = setTimeout(() => {
      app.log.error('graceful shutdown: timeout exceeded, forcing exit');
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    try {
      // 1. 关闭 HTTP 监听，等待已接入请求完成
      await app.close();
      app.log.info('graceful shutdown: fastify closed');
    } catch (err) {
      app.log.error({ err }, 'graceful shutdown: fastify close error');
    }

    // 2. 关闭下游连接（容错，不让单个失败阻塞其他）
    await Promise.allSettled([
      deps.closePool().catch((err: unknown) => {
        app.log.error({ err }, 'graceful shutdown: pool close error');
      }),
      deps.closeRedis().catch((err: unknown) => {
        app.log.error({ err }, 'graceful shutdown: redis close error');
      }),
    ]);

    clearTimeout(forceExit);
    app.log.info('graceful shutdown: done');
    process.exit(0);
  };

  process.once('SIGTERM', () => void handle('SIGTERM'));
  process.once('SIGINT', () => void handle('SIGINT'));
}

import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { fail } from '../utils/response.js';

/**
 * 全局错误处理。统一输出 §12.2 响应格式。
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(422).send(
        fail('VALIDATION_ERROR', '请求参数校验失败', {
          issues: error.issues,
        })
      );
      return;
    }

    if (error.statusCode === 401) {
      reply.code(401).send(fail('UNAUTHORIZED', error.message || '未授权'));
      return;
    }

    if (error.validation) {
      reply.code(422).send(
        fail('VALIDATION_ERROR', error.message, {
          validation: error.validation,
        })
      );
      return;
    }

    request.log.error({ err: error }, 'unhandled error');
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply
      .code(status)
      .send(
        fail(
          status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
          status === 500 ? '服务器内部错误' : error.message
        )
      );
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(fail('NOT_FOUND', '资源不存在'));
  });
}

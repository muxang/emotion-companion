import type { FastifyInstance } from 'fastify';
import { LoginRequestSchema } from '@emotion/shared';
import { ok, fail } from '../utils/response.js';
import { loadEnv } from '../config/env.js';

/**
 * /api/auth/login    POST  匿名登录（首次注册或换取新 token）
 * /api/auth/refresh  POST  Bearer 刷新（允许过期 30 天内）
 *
 * 见 CLAUDE.md §11 / §12.1
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();

  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send(
          fail('VALIDATION_ERROR', 'anonymous_id 校验失败', {
            issues: parsed.error.issues,
          })
        );
    }

    const { anonymous_id } = parsed.data;
    const existing = await app.repos.users.findByAnonymousId(anonymous_id);
    const user = existing
      ? existing
      : await app.repos.users.createWithAnonymousId(anonymous_id);

    const token = app.jwt.sign({ sub: user.id });
    const expiresIn = parseExpiresInSeconds(env.JWT_EXPIRES_IN);

    return reply.send(
      ok({
        token,
        user_id: user.id,
        expires_in: expiresIn,
      })
    );
  });

  app.post('/auth/refresh', async (request, reply) => {
    // 允许已过期 token 在宽限窗口内刷新
    let decoded: { sub: string; iat: number; exp: number };
    try {
      decoded = await request.jwtVerify<{
        sub: string;
        iat: number;
        exp: number;
      }>({ ignoreExpiration: true });
    } catch {
      return reply
        .code(401)
        .send(fail('UNAUTHORIZED', 'token 无效'));
    }

    if (!decoded.sub || typeof decoded.iat !== 'number') {
      return reply
        .code(401)
        .send(fail('UNAUTHORIZED', 'token 缺失必要字段'));
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const ageSec = nowSec - decoded.iat;
    if (ageSec > env.JWT_REFRESH_GRACE_SECONDS) {
      return reply
        .code(401)
        .send(fail('REFRESH_EXPIRED', 'token 已超过可刷新窗口，请重新登录'));
    }

    // 校验用户仍存在
    const user = await app.repos.users.findById(decoded.sub);
    if (!user) {
      return reply
        .code(401)
        .send(fail('UNAUTHORIZED', '用户不存在'));
    }

    const token = app.jwt.sign({ sub: user.id });
    return reply.send(
      ok({
        token,
        user_id: user.id,
        expires_in: parseExpiresInSeconds(env.JWT_EXPIRES_IN),
      })
    );
  });
}

/** 把 "7d"/"24h"/"3600s"/纯数字 转成秒数 */
function parseExpiresInSeconds(value: string): number {
  const m = /^(\d+)([smhd]?)$/.exec(value.trim());
  if (!m) return 60 * 60 * 24 * 7;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 60 * 60;
    case 'd':
      return n * 60 * 60 * 24;
    default:
      return n;
  }
}

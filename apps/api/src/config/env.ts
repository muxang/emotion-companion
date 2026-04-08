import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Phase 7：Redis URL，缺省则限流降级为内存 store，不阻塞启动。 */
  REDIS_URL: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().optional()
    ),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** 允许过期 token 在该秒数窗口内继续刷新（默认 30 天） */
  JWT_REFRESH_GRACE_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  ENABLE_SAFETY_GUARD: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // ---- Phase 2 ----
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  /** 可选：自定义 Anthropic API 入口（代理 / 中转 / 私有网关）。留空则用官方 https://api.anthropic.com */
  ANTHROPIC_BASE_URL: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().url('ANTHROPIC_BASE_URL must be a valid URL').optional()
    ),
  AI_MODEL: z.string().default('claude-sonnet-4-20250514'),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  INTAKE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** skill 调用超时（tong-analysis / message-coach / recovery-plan / companion-response）
   *  这些 skill 需要生成结构化 JSON，实际耗时通常 20–40s，默认给 90s 宽裕量。 */
  SKILL_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[env] Invalid environment variables:\n${issues}`);
  }

  // Phase 7 上线检查清单（CLAUDE.md §20）
  // 生产环境下对关键配置额外校验，避免带默认值或 localhost 上线。
  if (parsed.data.NODE_ENV === 'production') {
    const errors: string[] = [];
    if (!parsed.data.ENABLE_SAFETY_GUARD) {
      errors.push('ENABLE_SAFETY_GUARD must be true in production');
    }
    if (parsed.data.CORS_ORIGIN.includes('localhost')) {
      errors.push('CORS_ORIGIN must not contain localhost in production');
    }
    if (/^(change|default|secret|test|dev)/i.test(parsed.data.JWT_SECRET)) {
      errors.push('JWT_SECRET looks like a placeholder; set a strong production value');
    }
    if (errors.length > 0) {
      throw new Error(
        `[env] Production environment check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
      );
    }
  }

  cached = parsed.data;
  return cached;
}

/** 测试辅助：清空缓存以便重新读取 process.env */
export function resetEnvCache(): void {
  cached = null;
}

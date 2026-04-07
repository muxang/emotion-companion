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

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** 允许过期 token 在该秒数窗口内继续刷新（默认 30 天） */
  JWT_REFRESH_GRACE_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  ENABLE_SAFETY_GUARD: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
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
  cached = parsed.data;
  return cached;
}

/** 测试辅助：清空缓存以便重新读取 process.env */
export function resetEnvCache(): void {
  cached = null;
}

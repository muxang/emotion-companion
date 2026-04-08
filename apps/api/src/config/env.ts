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

  // ---- AI Provider ----
  /** 选择 AI 后端：anthropic | openai | deepseek | qwen | zhipu | custom */
  AI_PROVIDER: z.string().default('anthropic'),
  /** Anthropic API Key（AI_PROVIDER=anthropic 时必填） */
  ANTHROPIC_API_KEY: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().optional()
    ),
  /** OpenAI-compatible API Key（AI_PROVIDER ∈ openai/deepseek/qwen/zhipu/custom 时必填） */
  OPENAI_API_KEY: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().optional()
    ),
  /** 覆盖当前 provider 的默认 Base URL（所有 provider 均支持；AI_PROVIDER=custom 时必填） */
  OPENAI_BASE_URL: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().url('OPENAI_BASE_URL must be a valid URL').optional()
    ),
  AI_MODEL: z.string().default('claude-sonnet-4-20250514'),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  INTAKE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** skill 调用超时（tong-analysis / message-coach / recovery-plan / companion-response）
   *  这些 skill 需要生成结构化 JSON，实际耗时通常 20–40s，默认给 90s 宽裕量。 */
  SKILL_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  /** SDK 底层 HTTP 超时（必须 >= SKILL_TIMEOUT_MS，否则 SDK 会比软 abort 更早切断）
   *  默认 120s，覆盖 SDK 内置的 60s 上限。 */
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
}).superRefine((data, ctx) => {
  const provider = data.AI_PROVIDER.toLowerCase();
  const knownProviders = ['anthropic', 'openai', 'deepseek', 'qwen', 'zhipu', 'custom'];
  if (!knownProviders.includes(provider)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_PROVIDER'],
      message: `不支持的 AI_PROVIDER "${data.AI_PROVIDER}"。支持：${knownProviders.join(', ')}`,
    });
    return;
  }
  if (provider === 'anthropic' && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANTHROPIC_API_KEY'],
      message: 'AI_PROVIDER=anthropic 时 ANTHROPIC_API_KEY 必填',
    });
  }
  const openaiLike = ['openai', 'deepseek', 'qwen', 'zhipu', 'custom'];
  if (openaiLike.includes(provider) && !data.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: `AI_PROVIDER=${provider} 时 OPENAI_API_KEY 必填`,
    });
  }
  if (provider === 'custom' && !data.OPENAI_BASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_BASE_URL'],
      message: 'AI_PROVIDER=custom 时 OPENAI_BASE_URL 必填',
    });
  }
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

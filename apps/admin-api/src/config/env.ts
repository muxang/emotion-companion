import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  ADMIN_PORT: z.coerce.number().int().positive().default(3001),
  ADMIN_HOST: z.string().default('0.0.0.0'),
  ADMIN_CORS_ORIGIN: z.string().default('http://localhost:5174'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  ADMIN_TOKEN: z
    .string()
    .min(32, 'ADMIN_TOKEN must be at least 32 characters'),

  API_BASE_URL: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().url().optional()
    ),
});

export type AdminEnv = z.infer<typeof EnvSchema>;

let cached: AdminEnv | null = null;

export function loadEnv(): AdminEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[admin-env] Invalid environment variables:\n${issues}`);
  }

  if (parsed.data.NODE_ENV === 'production') {
    const errors: string[] = [];
    if (parsed.data.ADMIN_CORS_ORIGIN.includes('localhost')) {
      errors.push('ADMIN_CORS_ORIGIN must not contain localhost in production');
    }
    if (/^(change|default|secret|test|dev)/i.test(parsed.data.ADMIN_TOKEN)) {
      errors.push('ADMIN_TOKEN looks like a placeholder; set a strong production value');
    }
    if (errors.length > 0) {
      throw new Error(
        `[admin-env] Production environment check failed:\n${errors
          .map((e) => `  - ${e}`)
          .join('\n')}`
      );
    }
  }

  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

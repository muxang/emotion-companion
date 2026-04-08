// Vitest 测试环境变量。在 loadEnv() 之前注入。
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.HOST = '127.0.0.1';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.DATABASE_SSL = 'false';
process.env.JWT_SECRET = 'test-jwt-secret-please-change-test-only';
process.env.JWT_EXPIRES_IN = '7d';
process.env.JWT_REFRESH_GRACE_SECONDS = '2592000';
process.env.MAX_REQUESTS_PER_MINUTE = '1000';
process.env.ENABLE_SAFETY_GUARD = 'true';
// Phase 2 — 测试用 FakeAIClient，不会真正调 API，但 env 校验需要非空
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.AI_MODEL = 'fake-model';
process.env.AI_MAX_TOKENS = '256';
process.env.INTAKE_TIMEOUT_MS = '5000';
process.env.SKILL_TIMEOUT_MS = '30000';
process.env.AI_REQUEST_TIMEOUT_MS = '60000';

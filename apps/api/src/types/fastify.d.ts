import '@fastify/jwt';
import type { AIClient } from '@emotion/core-ai';
import type { UserRepository } from '../db/repositories/users.js';
import type { SessionRepository } from '../db/repositories/sessions.js';
import type { MessageRepository } from '../db/repositories/messages.js';
import type { MemoryRepository } from '../db/repositories/memory.js';
import type { RecoveryRepository } from '../db/repositories/recovery.js';
import type { OrchestratorMemoryDeps } from '../orchestrator/types.js';

declare module 'fastify' {
  interface FastifyInstance {
    repos: {
      users: UserRepository;
      sessions: SessionRepository;
      messages: MessageRepository;
      memory: MemoryRepository;
      recovery: RecoveryRepository;
    };
    aiClient: AIClient;
    /** Phase 5: orchestrator 的记忆依赖闭包；测试可注入 mock */
    memoryDeps?: OrchestratorMemoryDeps;
    requireAuth: import('fastify').preHandlerAsyncHookHandler;
  }

  interface FastifyRequest {
    userId?: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string; iat: number; exp: number };
  }
}

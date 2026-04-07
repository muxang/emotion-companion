import '@fastify/jwt';
import type { AIClient } from '@emotion/core-ai';
import type { UserRepository } from '../db/repositories/users.js';
import type { SessionRepository } from '../db/repositories/sessions.js';
import type { MessageRepository } from '../db/repositories/messages.js';

declare module 'fastify' {
  interface FastifyInstance {
    repos: {
      users: UserRepository;
      sessions: SessionRepository;
      messages: MessageRepository;
    };
    aiClient: AIClient;
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

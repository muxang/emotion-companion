// 必须在导入 buildApp 之前注入测试环境变量
import './setup.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { UserRepository } from '../src/db/repositories/users.js';
import type { SessionRepository } from '../src/db/repositories/sessions.js';
import type { MessageRepository } from '../src/db/repositories/messages.js';
import type {
  ConversationMode,
  MessageDTO,
  SessionDTO,
  UserDTO,
} from '@emotion/shared';

export interface MockState {
  usersByAnonymousId: Map<string, UserDTO>;
  usersById: Map<string, UserDTO>;
  sessions: Map<string, SessionDTO>;
  messages: Map<string, MessageDTO[]>;
  createdUsers: number;
  createdSessions: number;
  deletedSessions: number;
}

export function makeMockRepos(): {
  state: MockState;
  users: UserRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
} {
  const state: MockState = {
    usersByAnonymousId: new Map(),
    usersById: new Map(),
    sessions: new Map(),
    messages: new Map(),
    createdUsers: 0,
    createdSessions: 0,
    deletedSessions: 0,
  };

  let userCounter = 0;
  let sessionCounter = 0;

  const users: UserRepository = {
    async findByAnonymousId(anonymousId) {
      return state.usersByAnonymousId.get(anonymousId) ?? null;
    },
    async findById(id) {
      return state.usersById.get(id) ?? null;
    },
    async createWithAnonymousId(anonymousId) {
      userCounter++;
      const id = `00000000-0000-0000-0000-${String(userCounter).padStart(12, '0')}`;
      const now = new Date().toISOString();
      const user: UserDTO = {
        id,
        anonymous_id: anonymousId,
        nickname: null,
        tone_preference: 'warm',
        memory_enabled: true,
        created_at: now,
        updated_at: now,
      };
      state.usersByAnonymousId.set(anonymousId, user);
      state.usersById.set(id, user);
      state.createdUsers++;
      return user;
    },
  };

  const sessions: SessionRepository = {
    async listByUser(userId) {
      return Array.from(state.sessions.values()).filter(
        (s) => s.user_id === userId
      );
    },
    async findById(id) {
      return state.sessions.get(id) ?? null;
    },
    async create({ user_id, title, mode }) {
      sessionCounter++;
      const id = `11111111-1111-1111-1111-${String(sessionCounter).padStart(12, '0')}`;
      const now = new Date().toISOString();
      const s: SessionDTO = {
        id,
        user_id,
        title: title ?? '新对话',
        mode: (mode ?? 'companion') as ConversationMode,
        message_count: 0,
        created_at: now,
        updated_at: now,
      };
      state.sessions.set(id, s);
      state.createdSessions++;
      return s;
    },
    async delete(id, userId) {
      const s = state.sessions.get(id);
      if (!s || s.user_id !== userId) return false;
      state.sessions.delete(id);
      state.deletedSessions++;
      return true;
    },
  };

  const messages: MessageRepository = {
    async listBySession(sessionId) {
      return state.messages.get(sessionId) ?? [];
    },
  };

  return { state, users, sessions, messages };
}

export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  mocks: ReturnType<typeof makeMockRepos>;
}> {
  const mocks = makeMockRepos();
  const app = await buildApp({
    repos: {
      users: mocks.users,
      sessions: mocks.sessions,
      messages: mocks.messages,
    },
  });
  await app.ready();
  return { app, mocks };
}

// 必须在导入 buildApp 之前注入测试环境变量
import './setup.js';
import type { FastifyInstance } from 'fastify';
import type { AIClient } from '@emotion/core-ai';
import { buildApp } from '../src/app.js';
import type { UserRepository } from '../src/db/repositories/users.js';
import type {
  AppendMessageInput,
  MessageRepository,
} from '../src/db/repositories/messages.js';
import type { SessionRepository } from '../src/db/repositories/sessions.js';
import type {
  ConversationMode,
  MessageDTO,
  RiskLevel,
  SessionDTO,
  UserDTO,
} from '@emotion/shared';

export interface MockState {
  usersByAnonymousId: Map<string, UserDTO>;
  usersById: Map<string, UserDTO>;
  sessions: Map<string, SessionDTO>;
  messages: Map<string, MessageDTO[]>;
  appendedMessages: AppendMessageInput[];
  createdUsers: number;
  createdSessions: number;
  deletedSessions: number;
  incrementCalls: Array<{ id: string; delta: number }>;
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
    appendedMessages: [],
    createdUsers: 0,
    createdSessions: 0,
    deletedSessions: 0,
    incrementCalls: [],
  };

  let userCounter = 0;
  let sessionCounter = 0;
  let messageCounter = 0;

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
    async incrementMessageCount(id, delta) {
      state.incrementCalls.push({ id, delta });
      const s = state.sessions.get(id);
      if (!s) return null;
      const updated: SessionDTO = {
        ...s,
        message_count: s.message_count + delta,
        updated_at: new Date().toISOString(),
      };
      state.sessions.set(id, updated);
      return updated;
    },
  };

  const messages: MessageRepository = {
    async listBySession(sessionId) {
      return state.messages.get(sessionId) ?? [];
    },
    async recentBySession(sessionId, limit) {
      const all = state.messages.get(sessionId) ?? [];
      return all.slice(-limit);
    },
    async lastAssistantRisk(sessionId) {
      const all = state.messages.get(sessionId) ?? [];
      for (let i = all.length - 1; i >= 0; i--) {
        const m = all[i]!;
        if (m.role === 'assistant') {
          return m.risk_level;
        }
      }
      return null;
    },
    async append(input) {
      state.appendedMessages.push(input);
      messageCounter++;
      const id = `22222222-2222-2222-2222-${String(messageCounter).padStart(12, '0')}`;
      const dto: MessageDTO = {
        id,
        session_id: input.session_id,
        role: input.role,
        content: input.content,
        risk_level: (input.risk_level ?? null) as RiskLevel | null,
        created_at: new Date().toISOString(),
      };
      const arr = state.messages.get(input.session_id) ?? [];
      arr.push(dto);
      state.messages.set(input.session_id, arr);
      return dto;
    },
  };

  return { state, users, sessions, messages };
}

// ============================================================
// FakeAIClient — 单元 / 集成测试用
// ============================================================

export interface FakeAICall {
  kind: 'complete' | 'streamText';
  system?: string;
  messages: Array<{ role: string; content: string }>;
}

export interface FakeAIScript {
  /** 按调用顺序返回；最后一个值会被复用 */
  completeReplies?: string[];
  streamReplies?: Array<string | string[]>;
  /** 抛错替代正常返回 */
  throwOnComplete?: boolean;
  throwOnStream?: boolean;
}

export interface FakeAIClient extends AIClient {
  __script: FakeAIScript;
  __calls: FakeAICall[];
  __completeIdx: number;
  __streamIdx: number;
}

export function createFakeAIClient(script: FakeAIScript = {}): FakeAIClient {
  const calls: FakeAICall[] = [];
  let completeIdx = 0;
  let streamIdx = 0;

  const client = {
    __script: script,
    __calls: calls,
    get __completeIdx(): number {
      return completeIdx;
    },
    get __streamIdx(): number {
      return streamIdx;
    },
    getModel(): string {
      return 'fake-model';
    },
    async complete(opts: {
      system?: string;
      messages: Array<{ role: string; content: string }>;
    }): Promise<string> {
      calls.push({
        kind: 'complete',
        system: opts.system,
        messages: opts.messages,
      });
      if (script.throwOnComplete) {
        throw new Error('FakeAIClient.complete forced error');
      }
      const replies = script.completeReplies ?? [];
      const reply =
        replies[completeIdx] ?? replies[replies.length - 1] ?? '';
      completeIdx++;
      return reply;
    },
    streamText(opts: {
      system?: string;
      messages: Array<{ role: string; content: string }>;
    }): AsyncIterable<string> {
      calls.push({
        kind: 'streamText',
        system: opts.system,
        messages: opts.messages,
      });
      const idx = streamIdx;
      streamIdx++;
      const replies = script.streamReplies ?? [];
      const entry = replies[idx] ?? replies[replies.length - 1] ?? '';
      const chunks = Array.isArray(entry) ? entry : [entry];
      const throwOnStream = script.throwOnStream;
      return {
        async *[Symbol.asyncIterator](): AsyncIterator<string> {
          if (throwOnStream) {
            throw new Error('FakeAIClient.streamText forced error');
          }
          for (const ch of chunks) yield ch;
        },
      };
    },
  } as unknown as FakeAIClient;

  return client;
}

// ============================================================
// buildTestApp
// ============================================================

export interface BuildTestAppOptions {
  aiClient?: AIClient;
}

export async function buildTestApp(
  options: BuildTestAppOptions = {}
): Promise<{
  app: FastifyInstance;
  mocks: ReturnType<typeof makeMockRepos>;
  aiClient: AIClient;
}> {
  const mocks = makeMockRepos();
  const aiClient = options.aiClient ?? createFakeAIClient();
  const app = await buildApp({
    repos: {
      users: mocks.users,
      sessions: mocks.sessions,
      messages: mocks.messages,
    },
    aiClient,
  });
  await app.ready();
  return { app, mocks, aiClient };
}

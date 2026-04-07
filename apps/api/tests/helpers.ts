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
import type { MemoryRepository } from '../src/db/repositories/memory.js';
import type {
  ConversationMode,
  MemorySummaryDTO,
  MessageDTO,
  RelationshipEntityDTO,
  RelationshipEventDTO,
  RiskLevel,
  SessionDTO,
  UserDTO,
  UserProfileDTO,
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
  // Phase 5 memory state
  profiles: Map<string, UserProfileDTO>;
  entities: Map<string, RelationshipEntityDTO[]>;
  events: Map<string, RelationshipEventDTO[]>;
  summaries: Map<string, MemorySummaryDTO[]>;
  memoryDeleteCalls: number;
}

export function makeMockRepos(): {
  state: MockState;
  users: UserRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
  memory: MemoryRepository;
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
    profiles: new Map(),
    entities: new Map(),
    events: new Map(),
    summaries: new Map(),
    memoryDeleteCalls: 0,
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
    async updateSettings(id, input) {
      const existing = state.usersById.get(id);
      if (!existing) return null;
      const updated: UserDTO = {
        ...existing,
        tone_preference: input.tone_preference ?? existing.tone_preference,
        memory_enabled:
          input.memory_enabled ?? existing.memory_enabled,
        updated_at: new Date().toISOString(),
      };
      state.usersById.set(id, updated);
      state.usersByAnonymousId.set(updated.anonymous_id, updated);
      return updated;
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

  let entityCounter = 0;
  let eventCounter = 0;
  let summaryCounter = 0;

  const memory: MemoryRepository = {
    async getUserProfile(userId) {
      return state.profiles.get(userId) ?? null;
    },
    async upsertUserProfile(userId, memoryEnabled, input) {
      if (!memoryEnabled) return null;
      const now = new Date().toISOString();
      const existing = state.profiles.get(userId);
      const merged: UserProfileDTO = {
        user_id: userId,
        traits_json: input.traits_json ?? existing?.traits_json ?? {},
        attachment_style:
          input.attachment_style ?? existing?.attachment_style ?? null,
        boundary_preferences:
          input.boundary_preferences ?? existing?.boundary_preferences ?? {},
        common_triggers:
          input.common_triggers ?? existing?.common_triggers ?? [],
        updated_at: now,
      };
      state.profiles.set(userId, merged);
      return merged;
    },
    async getRelationshipEntities(userId) {
      return state.entities.get(userId) ?? [];
    },
    async createRelationshipEntity(memoryEnabled, input) {
      if (!memoryEnabled) return null;
      entityCounter++;
      const id = `e0000000-0000-0000-0000-${String(entityCounter).padStart(12, '0')}`;
      const now = new Date().toISOString();
      const ent: RelationshipEntityDTO = {
        id,
        user_id: input.user_id,
        label: input.label,
        relation_type: input.relation_type ?? null,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      };
      const arr = state.entities.get(input.user_id) ?? [];
      arr.push(ent);
      state.entities.set(input.user_id, arr);
      return ent;
    },
    async getRelationshipEvents(userId, limit = 10) {
      const all = state.events.get(userId) ?? [];
      return all.slice(0, limit);
    },
    async createRelationshipEvent(memoryEnabled, input) {
      if (!memoryEnabled) return null;
      eventCounter++;
      const id = `f0000000-0000-0000-0000-${String(eventCounter).padStart(12, '0')}`;
      const now = new Date().toISOString();
      const ev: RelationshipEventDTO = {
        id,
        user_id: input.user_id,
        entity_id: input.entity_id ?? null,
        event_type: input.event_type,
        event_time:
          input.event_time instanceof Date
            ? input.event_time.toISOString()
            : (input.event_time as string | null) ?? null,
        summary: input.summary,
        evidence_json: input.evidence_json ?? [],
        created_at: now,
      };
      const arr = state.events.get(input.user_id) ?? [];
      arr.unshift(ev);
      state.events.set(input.user_id, arr);
      return ev;
    },
    async getMemorySummaries(userId, _summaryType, limit = 3) {
      const all = state.summaries.get(userId) ?? [];
      return all.slice(0, limit);
    },
    async createMemorySummary(memoryEnabled, input) {
      if (!memoryEnabled) return null;
      summaryCounter++;
      const id = `a0000000-0000-0000-0000-${String(summaryCounter).padStart(12, '0')}`;
      const sum: MemorySummaryDTO = {
        id,
        user_id: input.user_id,
        session_id: input.session_id ?? null,
        summary_type: input.summary_type,
        summary_text: input.summary_text,
        created_at: new Date().toISOString(),
      };
      const arr = state.summaries.get(input.user_id) ?? [];
      arr.unshift(sum);
      state.summaries.set(input.user_id, arr);
      return sum;
    },
    async deleteOrAnonymizeUserMemory(userId) {
      state.memoryDeleteCalls++;
      const summaries = state.summaries.get(userId) ?? [];
      const summariesDeleted = summaries.length;
      state.summaries.delete(userId);

      const profile = state.profiles.get(userId);
      const profileAnonymized = !!profile;
      if (profile) {
        state.profiles.set(userId, {
          ...profile,
          traits_json: {},
          attachment_style: null,
          boundary_preferences: {},
          common_triggers: [],
          updated_at: new Date().toISOString(),
        });
      }

      const entities = state.entities.get(userId) ?? [];
      const entitiesAnonymized = entities.length;
      state.entities.set(
        userId,
        entities.map((e) => ({
          ...e,
          label: '[已删除]',
          relation_type: null,
          notes: null,
        }))
      );

      const events = state.events.get(userId) ?? [];
      const eventsAnonymized = events.length;
      state.events.set(
        userId,
        events.map((e) => ({
          ...e,
          summary: '[已删除]',
          evidence_json: [],
        }))
      );

      return {
        summariesDeleted,
        profileAnonymized,
        entitiesAnonymized,
        eventsAnonymized,
      };
    },
  };

  return { state, users, sessions, messages, memory };
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
      memory: mocks.memory,
    },
    aiClient,
  });
  await app.ready();
  return { app, mocks, aiClient };
}

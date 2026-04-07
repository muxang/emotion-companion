import { create } from 'zustand';
import type { MessageDTO, SessionDTO } from '@emotion/shared';
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
} from '../api/sessions.js';

interface SessionState {
  sessions: SessionDTO[];
  currentSessionId: string | null;
  currentMessages: MessageDTO[];
  loading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  ensureSession: () => Promise<string>;
  newSession: () => Promise<string>;
  removeSession: (id: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  currentMessages: [],
  loading: false,
  error: null,

  async fetchSessions() {
    set({ loading: true, error: null });
    try {
      const sessions = await listSessions();
      set({ sessions, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '加载会话列表失败',
      });
    }
  },

  async selectSession(id) {
    set({ loading: true, error: null });
    try {
      const { session, messages } = await getSession(id);
      set({
        currentSessionId: session.id,
        currentMessages: messages,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '加载会话失败',
      });
    }
  },

  async ensureSession() {
    const current = get().currentSessionId;
    if (current) return current;
    return get().newSession();
  },

  async newSession() {
    const session = await createSession({});
    set({
      sessions: [session, ...get().sessions],
      currentSessionId: session.id,
      currentMessages: [],
    });
    return session.id;
  },

  async removeSession(id) {
    await deleteSession(id);
    const sessions = get().sessions.filter((s) => s.id !== id);
    const currentSessionId =
      get().currentSessionId === id ? null : get().currentSessionId;
    set({
      sessions,
      currentSessionId,
      currentMessages: currentSessionId ? get().currentMessages : [],
    });
  },
}));

import { create } from 'zustand';
import {
  clearToken,
  setToken,
  setUnauthorizedHandler,
} from '../api/client.js';
import { loginWithAnonymousId, refreshToken } from '../api/auth.js';
import {
  clearAnonymousId,
  getOrCreateAnonymousId,
} from '../utils/anonymousId.js';

export type AuthStatus = 'idle' | 'authing' | 'authed' | 'error';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  anonymousId: string | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  /** 401 fallback：先尝试 refresh，失败再用 anonymous_id 重新登录 */
  reauth: () => Promise<string | null>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  userId: null,
  anonymousId: null,
  error: null,

  async bootstrap() {
    if (get().status === 'authing') return;
    set({ status: 'authing', error: null });
    try {
      const anonymousId = getOrCreateAnonymousId();
      const data = await loginWithAnonymousId(anonymousId);
      setToken(data.token);
      set({
        status: 'authed',
        userId: data.user_id,
        anonymousId,
        error: null,
      });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '登录失败',
      });
    }
  },

  async reauth() {
    try {
      const data = await refreshToken();
      setToken(data.token);
      set({ status: 'authed', userId: data.user_id });
      return data.token;
    } catch {
      // refresh 失败 → 回退到匿名重新登录
      try {
        const anonymousId = getOrCreateAnonymousId();
        const data = await loginWithAnonymousId(anonymousId);
        setToken(data.token);
        set({ status: 'authed', userId: data.user_id, anonymousId });
        return data.token;
      } catch (err) {
        set({
          status: 'error',
          error: err instanceof Error ? err.message : '重新登录失败',
        });
        return null;
      }
    }
  },

  logout() {
    clearToken();
    clearAnonymousId();
    set({ status: 'idle', userId: null, anonymousId: null });
  },
}));

// 注册 401 → reauth 回调
setUnauthorizedHandler(async () => {
  return useAuthStore.getState().reauth();
});

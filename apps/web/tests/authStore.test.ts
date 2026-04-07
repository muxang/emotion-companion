import { describe, it, expect, beforeEach, vi } from 'vitest';

// 必须在 import authStore 之前 mock api 模块
vi.mock('../src/api/auth.js', () => ({
  loginWithAnonymousId: vi.fn(async (anonymousId: string) => ({
    token: `token-for-${anonymousId}`,
    user_id: `user-${anonymousId}`,
    expires_in: 604800,
  })),
  refreshToken: vi.fn(async () => ({
    token: 'refreshed-token',
    user_id: 'user-refreshed',
    expires_in: 604800,
  })),
}));

import { useAuthStore } from '../src/stores/authStore.js';
import { getToken } from '../src/api/client.js';

describe('authStore.bootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      status: 'idle',
      userId: null,
      anonymousId: null,
      error: null,
    });
  });

  it('generates anonymous_id, calls login, persists token', async () => {
    await useAuthStore.getState().bootstrap();
    const state = useAuthStore.getState();
    expect(state.status).toBe('authed');
    expect(state.userId).toBeTruthy();
    expect(state.anonymousId).toBeTruthy();
    expect(getToken()).toBeTruthy();
  });

  it('reauth refreshes token and updates state', async () => {
    await useAuthStore.getState().bootstrap();
    const newToken = await useAuthStore.getState().reauth();
    expect(newToken).toBe('refreshed-token');
    expect(useAuthStore.getState().userId).toBe('user-refreshed');
  });

  it('logout clears token and resets state', async () => {
    await useAuthStore.getState().bootstrap();
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().status).toBe('idle');
    expect(getToken()).toBeNull();
  });
});

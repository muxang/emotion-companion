import { fetchJson } from './client.js';

export interface LoginData {
  token: string;
  user_id: string;
  expires_in: number;
}

export async function loginWithAnonymousId(
  anonymousId: string
): Promise<LoginData> {
  return fetchJson<LoginData>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ anonymous_id: anonymousId }),
    auth: false,
  });
}

export async function refreshToken(): Promise<LoginData> {
  return fetchJson<LoginData>('/api/auth/refresh', {
    method: 'POST',
  });
}

import { fetchJson } from './client.js';

export type TonePreference = 'warm' | 'rational' | 'direct';

export interface UserSettings {
  memory_enabled: boolean;
  tone_preference: TonePreference;
}

/** 拉取当前用户的偏好设置。 */
export async function getSettings(): Promise<UserSettings> {
  return fetchJson<UserSettings>('/api/settings', { method: 'GET' });
}

/** 更新当前用户的偏好设置（部分字段更新）。 */
export async function updateSettings(
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  return fetchJson<UserSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

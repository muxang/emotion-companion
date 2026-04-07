import { create } from 'zustand';
import {
  getSettings,
  updateSettings as apiUpdateSettings,
  type TonePreference,
  type UserSettings,
} from '../api/settings.js';

export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SettingsState {
  memoryEnabled: boolean;
  tonePreference: TonePreference;
  status: SettingsStatus;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  memoryEnabled: true,
  tonePreference: 'warm',
  status: 'idle',
  error: null,

  async fetchSettings() {
    set({ status: 'loading', error: null });
    try {
      const s = await getSettings();
      set({
        memoryEnabled: s.memory_enabled,
        tonePreference: s.tone_preference,
        status: 'ready',
        error: null,
      });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '加载设置失败',
      });
    }
  },

  async updateSettings(patch) {
    try {
      const s = await apiUpdateSettings(patch);
      set({
        memoryEnabled: s.memory_enabled,
        tonePreference: s.tone_preference,
        status: 'ready',
        error: null,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '保存设置失败',
      });
      throw err;
    }
  },
}));

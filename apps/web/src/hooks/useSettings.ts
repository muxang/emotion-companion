import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore.js';

/**
 * 设置 Hook：自动拉取一次，并暴露 store 中的状态与更新方法。
 */
export function useSettings(): {
  memoryEnabled: boolean;
  tonePreference: 'warm' | 'rational' | 'direct';
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  updateSettings: ReturnType<typeof useSettingsStore.getState>['updateSettings'];
  refetch: () => Promise<void>;
} {
  const memoryEnabled = useSettingsStore((s) => s.memoryEnabled);
  const tonePreference = useSettingsStore((s) => s.tonePreference);
  const status = useSettingsStore((s) => s.status);
  const error = useSettingsStore((s) => s.error);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  useEffect(() => {
    if (status === 'idle') {
      void fetchSettings();
    }
  }, [status, fetchSettings]);

  return {
    memoryEnabled,
    tonePreference,
    status,
    error,
    updateSettings,
    refetch: fetchSettings,
  };
}

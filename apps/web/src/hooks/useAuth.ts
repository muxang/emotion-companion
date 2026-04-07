import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore.js';

/**
 * 在应用启动时调用一次。
 * 检查 localStorage anonymous_id → 调用 /api/auth/login → 持久化 token。
 */
export function useAuth(): {
  ready: boolean;
  userId: string | null;
  error: string | null;
} {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.userId);
  const error = useAuthStore((s) => s.error);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    if (status === 'idle') {
      void bootstrap();
    }
  }, [status, bootstrap]);

  return {
    ready: status === 'authed',
    userId,
    error,
  };
}

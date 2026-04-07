import { useEffect } from 'react';
import { useSessionStore } from '../stores/sessionStore.js';
import { useAuthStore } from '../stores/authStore.js';

export function useSession(): ReturnType<typeof useSessionStore.getState> {
  const status = useAuthStore((s) => s.status);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  useEffect(() => {
    if (status === 'authed') {
      void fetchSessions();
    }
  }, [status, fetchSessions]);

  return useSessionStore.getState();
}

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'emotion_admin_token';

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function useAdminAuth() {
  const [token, setToken] = useState<string | null>(() => readToken());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setToken(readToken());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((value: string) => {
    window.localStorage.setItem(STORAGE_KEY, value);
    setToken(value);
  }, []);

  const clear = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  return { token, save, clear };
}

export function getAdminToken(): string | null {
  return readToken();
}

const KEY = 'emotion.anonymous_id';

export function getOrCreateAnonymousId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length >= 8) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  return id;
}

export function clearAnonymousId(): void {
  localStorage.removeItem(KEY);
}

export function readAnonymousId(): string | null {
  return localStorage.getItem(KEY);
}

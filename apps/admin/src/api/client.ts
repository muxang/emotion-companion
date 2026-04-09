import { getAdminToken } from '../hooks/useAdminAuth';

const BASE_URL = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:3001';

export class AdminApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  token?: string; // 用于登录前的临时校验
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function adminRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = options.token ?? getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['X-Admin-Token'] = token;

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  let payload: any = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!res.ok) {
    const message =
      payload?.error?.message || payload?.message || `请求失败 (${res.status})`;
    const code = payload?.error?.code;
    throw new AdminApiError(message, res.status, code);
  }

  // 兼容 { success, data } 与裸数据两种格式
  if (payload && typeof payload === 'object' && 'data' in payload && 'success' in payload) {
    return payload.data as T;
  }
  return payload as T;
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await adminRequest<unknown>('/admin/health', { token });
    return true;
  } catch {
    return false;
  }
}

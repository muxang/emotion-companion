import type { ApiResponse } from '@emotion/shared';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'emotion.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface FetchJsonOptions extends RequestInit {
  /** 是否携带 Bearer token，默认 true */
  auth?: boolean;
}

let onUnauthorized: (() => Promise<string | null>) | null = null;

/** 注册 401 时的回调（通常由 authStore 设置为重新登录） */
export function setUnauthorizedHandler(
  handler: (() => Promise<string | null>) | null
): void {
  onUnauthorized = handler;
}

export function buildUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function fetchJson<T>(
  path: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.authorization = `Bearer ${token}`;
  }

  const doFetch = async (): Promise<Response> =>
    fetch(buildUrl(path), { ...rest, headers: finalHeaders });

  let res = await doFetch();

  // 401 自动重登一次
  if (res.status === 401 && auth && onUnauthorized) {
    const newToken = await onUnauthorized();
    if (newToken) {
      finalHeaders.authorization = `Bearer ${newToken}`;
      res = await doFetch();
    }
  }

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) {
    throw new ApiError('NETWORK_ERROR', '响应解析失败', res.status);
  }
  if (!body.success) {
    throw new ApiError(
      body.error.code,
      body.error.message,
      res.status,
      body.error.details
    );
  }
  return body.data;
}

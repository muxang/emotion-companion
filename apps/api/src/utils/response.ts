import type { ApiError, ApiSuccess } from '@emotion/shared';

export function ok<T>(data: T): ApiSuccess<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

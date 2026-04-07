import { z } from 'zod';

/** 匿名登录请求体（CLAUDE.md §11） */
export const LoginRequestSchema = z.object({
  anonymous_id: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface LoginResponseData {
  token: string;
  user_id: string;
  expires_in: number;
}

/** 刷新 token 请求 —— 复用 Bearer，无 body 字段；预留扩展 */
export const RefreshRequestSchema = z.object({}).optional();

export interface RefreshResponseData {
  token: string;
  user_id: string;
  expires_in: number;
}

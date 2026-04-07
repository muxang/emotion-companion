import { IntakeResultSchema, type IntakeResult } from '@emotion/shared';

/**
 * 安全默认值：解析失败或缺字段时使用。
 * 走 companion + low risk，绝不会因 parser 失败把用户错误地推到危险或激进路径。
 */
export const SAFE_DEFAULT_INTAKE: IntakeResult = {
  emotion_state: 'mixed',
  issue_type: 'general',
  risk_level: 'low',
  next_mode: 'companion',
  confidence: 0,
  reasoning: 'parse_failed_safe_default',
};

/**
 * 从原始 LLM 输出中抽出 JSON 字符串。
 * 容忍三种格式：
 *  1. 纯 JSON
 *  2. ```json ... ``` 代码块包装
 *  3. ``` ... ``` 任意代码块包装
 */
export function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 优先匹配代码块包装
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // 直接尝试找首个 { 到末尾的 } 之间的内容（兜底应对前后多余文字）
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

/**
 * 解析 LLM 原始输出为 IntakeResult。
 * 解析失败/校验失败一律返回 SAFE_DEFAULT_INTAKE，永不抛错。
 */
export function parseIntakeOutput(raw: string): IntakeResult {
  const jsonStr = extractJson(raw);
  if (!jsonStr) return SAFE_DEFAULT_INTAKE;

  let json: unknown;
  try {
    json = JSON.parse(jsonStr);
  } catch {
    return SAFE_DEFAULT_INTAKE;
  }

  const result = IntakeResultSchema.safeParse(json);
  if (!result.success) {
    return SAFE_DEFAULT_INTAKE;
  }
  return result.data;
}

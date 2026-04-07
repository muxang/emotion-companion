import { AnalysisResultSchema, type AnalysisResult } from '@emotion/shared';

/**
 * 解析失败时的安全默认值。
 *
 * 不抛错：把失败状态降级为一段克制的"无法完成结构化分析"的提示，
 * 让用户感知到结果没出来，但不会暴露任何不实结论。
 * orchestrator 可以根据 confidence === 0 判定降级。
 */
export const SAFE_DEFAULT_ANALYSIS: AnalysisResult = {
  analysis:
    '抱歉，目前我没有办法基于你提供的信息给出一份足够稳的结构化分析。我们可以先把事情再说得具体一点，比如最近一次让你不舒服的具体场景、对方的原话或行为，我会更容易帮你看清。',
  evidence: [],
  risks: [],
  advice: '可以先把最近一次让你最在意的具体事件描述一下，我们一起从那里开始看。',
  confidence: 0,
  tone: 'gentle',
};

/**
 * 从原始 LLM 输出中抽出 JSON 字符串。
 * 容忍：
 *  1. 纯 JSON
 *  2. ```json ... ``` 代码块包装
 *  3. ``` ... ``` 任意代码块
 *  4. 前后多余文字（取首个 { 到末尾的 }）
 */
export function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

/**
 * 解析 LLM 原始输出为 AnalysisResult。
 * 任何失败一律返回 SAFE_DEFAULT_ANALYSIS，永不抛错。
 */
export function parseTongAnalysisOutput(raw: string): AnalysisResult {
  const jsonStr = extractJson(raw);
  if (!jsonStr) return SAFE_DEFAULT_ANALYSIS;

  let json: unknown;
  try {
    json = JSON.parse(jsonStr);
  } catch {
    return SAFE_DEFAULT_ANALYSIS;
  }

  const result = AnalysisResultSchema.safeParse(json);
  if (!result.success) {
    return SAFE_DEFAULT_ANALYSIS;
  }
  return result.data;
}

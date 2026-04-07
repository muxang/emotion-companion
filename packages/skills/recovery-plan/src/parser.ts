import { z } from 'zod';
import type { RecoveryPlanOutput } from './types.js';

/**
 * 解析失败时的安全默认值。
 *
 * 一段克制、不替用户做决定的兜底任务。
 * day_index 由调用方在 runRecoveryPlan 中覆盖为真实值。
 */
export function makeSafeDefaultTask(dayIndex: number): RecoveryPlanOutput {
  return {
    day_index: dayIndex,
    task: '今天找一件 30 分钟内能完成的小事去做：散一次步、把房间整理一个角落，或好好吃一顿饭。',
    reflection_prompt: '完成后写两句话：做这件事时，你心里最先冒出来的感受是什么？',
    encouragement: '允许自己只前进一小步，今天有做就够了。',
  };
}

/**
 * 从原始 LLM 输出中抽出 JSON 字符串。
 * 容忍：纯 JSON / ```json ... ``` / ``` ... ``` / 前后多余文字。
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

const Schema = z.object({
  task: z.string().min(1),
  reflection_prompt: z.string().min(1),
  encouragement: z.string().min(1),
});

/**
 * 解析 LLM 原始输出为单日 RecoveryTask。
 * 任何失败一律返回 makeSafeDefaultTask(dayIndex)，永不抛错。
 */
export function parseRecoveryPlanOutput(
  raw: string,
  dayIndex: number
): RecoveryPlanOutput {
  const jsonStr = extractJson(raw);
  if (!jsonStr) return makeSafeDefaultTask(dayIndex);

  let json: unknown;
  try {
    json = JSON.parse(jsonStr);
  } catch {
    return makeSafeDefaultTask(dayIndex);
  }

  const result = Schema.safeParse(json);
  if (!result.success) {
    return makeSafeDefaultTask(dayIndex);
  }

  return {
    day_index: dayIndex,
    task: result.data.task,
    reflection_prompt: result.data.reflection_prompt,
    encouragement: result.data.encouragement,
  };
}

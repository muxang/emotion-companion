import { z } from 'zod';
import type { MessageCoachOutput } from './types.js';

/**
 * 解析失败时的安全默认值。
 *
 * 三条克制的通用模板，覆盖三种语气，让用户至少有一组可选项，
 * 而不是看到一段空白或报错。orchestrator 仍可继续走 guard 与回放流程。
 */
export const SAFE_DEFAULT_COACH: MessageCoachOutput = {
  options: [
    {
      version: 'A',
      content:
        '在吗？我最近一直在想我们之间的事，想找个你方便的时候和你聊一下，不着急。',
      tone: '温和试探',
      usage_tip: '适合对方情绪可能不稳、还需要一点缓冲的阶段。',
    },
    {
      version: 'B',
      content:
        '我想和你认真说一下我现在的想法，不一定要现在回我，但我希望你看到。',
      tone: '直接坦诚',
      usage_tip: '适合你已经想清楚、希望明确表态的时候。',
    },
    {
      version: 'C',
      content:
        '突然有点想你，纯路过打个招呼，不用回复也不会扣你工资。',
      tone: '轻松幽默',
      usage_tip: '适合你们关系基础不错、氛围允许玩笑的时候。',
    },
  ],
};

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

const OptionSchema = z.object({
  version: z.enum(['A', 'B', 'C']),
  content: z.string().min(1).max(120), // 100 字硬约束 + 一点 buffer
  tone: z.string().min(1),
  usage_tip: z.string().min(1),
});

const Schema = z.object({
  options: z.array(OptionSchema).length(3),
});

/**
 * 解析 LLM 原始输出为 MessageCoachOutput。
 * 任何失败一律返回 SAFE_DEFAULT_COACH，永不抛错。
 */
export function parseMessageCoachOutput(raw: string): MessageCoachOutput {
  const jsonStr = extractJson(raw);
  if (!jsonStr) return SAFE_DEFAULT_COACH;

  let json: unknown;
  try {
    json = JSON.parse(jsonStr);
  } catch {
    return SAFE_DEFAULT_COACH;
  }

  const result = Schema.safeParse(json);
  if (!result.success) {
    return SAFE_DEFAULT_COACH;
  }

  // 强制按 A→B→C 排序，避免模型乱序导致 orchestrator 拼接错位
  const sorted = [...result.data.options].sort((a, b) =>
    a.version.localeCompare(b.version)
  );

  // 三条 version 必须正好覆盖 A/B/C，否则降级
  const versions = sorted.map((o) => o.version).join(',');
  if (versions !== 'A,B,C') {
    return SAFE_DEFAULT_COACH;
  }

  return { options: sorted };
}

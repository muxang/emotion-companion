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
 * 修复 LLM 在 JSON 字符串值内部写了未转义英文双引号的问题。
 *
 * 例：AI 输出 "analysis":"无论是"他说不"还是…"
 * 解析失败原因：内部的 " 未被转义为 \"
 *
 * 算法：状态机逐字符遍历，区分"字符串开/收口的引号"和"字符串值内部的裸引号"。
 * 判断标准：一个 " 后面（跳过空白）紧跟 ,:}] 或字符串末尾 → 是收口；否则是内部裸引号 → 转义为 \"
 */
function repairUnescapedQuotes(s: string): string {
  const out: string[] = [];
  let inString = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (inString) {
      if (ch === '\\') {
        // 已转义的字符：整个转义序列原样保留
        out.push(ch);
        i++;
        if (i < s.length) out.push(s[i]);
        i++;
        continue;
      }
      if (ch === '"') {
        // 检查这个 " 是收口引号还是内部裸引号
        let j = i + 1;
        while (j < s.length && ' \t\n\r'.includes(s[j])) j++;
        const next = j < s.length ? s[j] : '';
        if (',:}]'.includes(next) || j >= s.length) {
          // 收口引号
          inString = false;
          out.push('"');
        } else {
          // 内部裸引号，转义它
          out.push('\\"');
        }
      } else {
        out.push(ch);
      }
    } else {
      if (ch === '"') {
        inString = true;
        out.push('"');
      } else {
        out.push(ch);
      }
    }
    i++;
  }

  return out.join('');
}

/**
 * 解析 LLM 原始输出为 AnalysisResult。
 * 任何失败一律返回 SAFE_DEFAULT_ANALYSIS，永不抛错。
 * 解析流程：
 *  1. extractJson 提取 JSON 字符串
 *  2. JSON.parse 直接解析
 *  3. 若失败，尝试 repairUnescapedQuotes 后再解析（处理 AI 内部引号未转义的情况）
 */
export function parseTongAnalysisOutput(raw: string): AnalysisResult {
  const jsonStr = extractJson(raw);
  if (!jsonStr) return SAFE_DEFAULT_ANALYSIS;

  let json: unknown;

  // 第一次尝试：原始解析
  try {
    json = JSON.parse(jsonStr);
  } catch {
    // 第二次尝试：修复未转义引号后再解析
    try {
      json = JSON.parse(repairUnescapedQuotes(jsonStr));
    } catch {
      return SAFE_DEFAULT_ANALYSIS;
    }
  }

  const result = AnalysisResultSchema.safeParse(json);
  if (!result.success) {
    return SAFE_DEFAULT_ANALYSIS;
  }
  return result.data;
}

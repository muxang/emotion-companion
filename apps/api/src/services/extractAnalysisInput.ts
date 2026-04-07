/**
 * extractAnalysisInput
 *
 * 把用户一段自然语言描述抽取为结构化的 TongAnalysisInput。
 * 失败时一律走安全降级（用原文做单条 fact），永不抛错。
 */
import type { AIClient } from '@emotion/core-ai';
import type { TongAnalysisInput } from '@emotion/shared';

const SYSTEM_PROMPT = `你是一个文本结构化助手。你的任务：从用户用自然语言描述的一段感情困惑中，提取四个字段，输出严格 JSON。

字段定义（键名必须完全一致）：

user_goal: 用户想弄清楚什么。一句话，去掉情绪词。例如："判断对方是否还有继续的意愿"。

relationship_stage: 必须从下面五个值中精确选一个：
  - "暧昧中"
  - "恋爱中"
  - "分手后"
  - "失联中"
  - "其他"

facts: 客观事实数组。每条一句话，只描述发生过的具体行为或情境，去除任何情绪词与主观评价。例如："对方一周不主动联系" 是事实，"他根本不在乎我" 不是事实。如果实在抽不出客观事实，就把原文当成单条事实放入数组。数组长度 1~10。

user_state: 用户当前的情绪状态。一句话。例如："反复内耗，深夜焦虑"。

铁律：
1. 只输出 JSON 对象，不要 markdown 代码块包装、不要前言。
2. 不要凭空虚构原文中没有的事实。
3. 不要替用户做判断，不要补全对方动机。
4. relationship_stage 必须是上面五个枚举值之一，模糊的归到"其他"。`;

interface ExtractDeps {
  ai: AIClient;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ExtractedRaw {
  user_goal?: unknown;
  relationship_stage?: unknown;
  facts?: unknown;
  user_state?: unknown;
}

const REQUIRED_OUTPUT: TongAnalysisInput['required_output'] = [
  'analysis',
  'evidence',
  'risks',
  'advice',
];

const SAFE_DEFAULT = (userText: string): TongAnalysisInput => ({
  user_goal: '了解这段关系',
  relationship_stage: '未知',
  facts: [userText.trim().slice(0, 500)],
  user_state: '情绪未知',
  required_output: REQUIRED_OUTPUT,
});

/**
 * 容忍三种格式：
 *  1. 纯 JSON
 *  2. ```json ... ``` 包装
 *  3. 前后多余文字
 */
function extractJsonString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) return fence[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return null;
}

const ALLOWED_STAGES = new Set([
  '暧昧中',
  '恋爱中',
  '分手后',
  '失联中',
  '其他',
]);

function parseExtracted(raw: string, userText: string): TongAnalysisInput {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) return SAFE_DEFAULT(userText);

  let parsed: ExtractedRaw;
  try {
    parsed = JSON.parse(jsonStr) as ExtractedRaw;
  } catch {
    return SAFE_DEFAULT(userText);
  }

  const user_goal =
    typeof parsed.user_goal === 'string' && parsed.user_goal.trim().length > 0
      ? parsed.user_goal.trim().slice(0, 500)
      : '了解这段关系';

  const stageRaw =
    typeof parsed.relationship_stage === 'string'
      ? parsed.relationship_stage.trim()
      : '';
  const relationship_stage = ALLOWED_STAGES.has(stageRaw) ? stageRaw : '其他';

  const factsArr = Array.isArray(parsed.facts) ? parsed.facts : [];
  const facts = factsArr
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map((f) => f.trim().slice(0, 500))
    .slice(0, 10);
  const finalFacts =
    facts.length > 0 ? facts : [userText.trim().slice(0, 500)];

  const user_state =
    typeof parsed.user_state === 'string' &&
    parsed.user_state.trim().length > 0
      ? parsed.user_state.trim().slice(0, 500)
      : '情绪未知';

  return {
    user_goal,
    relationship_stage,
    facts: finalFacts,
    user_state,
    required_output: REQUIRED_OUTPUT,
  };
}

export async function extractAnalysisInput(
  userText: string,
  deps: ExtractDeps
): Promise<TongAnalysisInput> {
  let raw: string;
  try {
    raw = await deps.ai.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }],
      maxTokens: 512,
      signal: deps.signal,
      timeoutMs: deps.timeoutMs ?? 10_000,
    });
  } catch {
    return SAFE_DEFAULT(userText);
  }
  return parseExtracted(raw, userText);
}

export const __test__ = { parseExtracted, SAFE_DEFAULT };

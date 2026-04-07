/**
 * AI 辅助风险分类器（Phase 7）
 *
 * 由 runFullTriage 在关键词分类之后调用，作为二次校验。
 * 设计原则：
 *  - 永远不抛错：解析失败 / 超时 / AI 异常 → 返回 null，由调用方回退到关键词结果
 *  - 硬超时 3 秒：用 Promise.race + 内部 AbortController，不依赖 AIClient 自身的 timeoutMs
 *  - 不依赖 @emotion/core-ai，而是定义最小接口 AIClassifierClient，
 *    AIClient 天然满足该接口，避免 packages 之间形成循环依赖
 */
import type { RiskLevel } from '@emotion/shared';

/**
 * 最小 AI 客户端接口。
 * 任何拥有 `complete` 方法且签名兼容的对象都可作为 classifier 客户端。
 */
export interface AIClassifierClient {
  complete(opts: {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxTokens?: number;
  }): Promise<string>;
}

export interface AIClassifierResult {
  risk_level: RiskLevel;
  confidence: number;
  reasoning: string;
}

export interface RunAIClassifierOptions {
  /** 外部 abort（例如客户端中断请求） */
  signal?: AbortSignal;
  /** 硬超时，默认 3000 ms */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;

const SYSTEM_PROMPT = `你是情感陪伴助手的安全分类器。你的唯一任务是评估用户输入的真实情绪风险等级。

风险等级定义：
- low：普通倾诉、日常情感困惑、轻度纠结，无任何危险信号。
- medium：明显反复内耗、情绪脆弱、过度哭泣、强烈否定自己但无伤害意图。
- high：明显情绪失控、强烈自我否定、提及"想消失/活不下去/伤害自己"等隐性危险。
- critical：明确危险表达（自杀/自残的具体念头、极度崩溃、失去现实感、有动手迹象）。

判断要求：
1. 基于"真实风险"判断，不是基于"用词激烈程度"。
2. 隐喻/夸张/抱怨语境（例："累死了""被气死"）不应升级为 high/critical。
3. 任何明确指向自我伤害的表达，至少 high；具体计划/方法/已动手 → critical。
4. 仅输出严格 JSON，不要任何解释、Markdown、代码块包装。

输出格式（严格 JSON，必须包含全部三个字段）：
{"risk_level":"low|medium|high|critical","confidence":0.0~1.0,"reasoning":"一句话内部理由"}`;

/**
 * 调用 AI 进行二次风险分类。
 *
 * @returns 解析成功的结果；任何失败/超时/异常均返回 null
 */
export async function runAIClassifier(
  userText: string,
  client: AIClassifierClient,
  options: RunAIClassifierOptions = {}
): Promise<AIClassifierResult | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 内部 AbortController：硬超时 + 合并外部 signal
  const ac = new AbortController();
  const onExternalAbort = (): void => ac.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      ac.abort();
    } else {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  // 用 Promise.race 给一个独立的"超时 sentinel"，确保 3 秒后必然解锁
  const timeoutSentinel = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs + 50);
  });

  try {
    const completion = client.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }],
      signal: ac.signal,
      timeoutMs,
      maxTokens: 200,
    });

    const text = await Promise.race([
      completion.catch(() => null),
      timeoutSentinel,
    ]);

    if (text === null || typeof text !== 'string') return null;
    return parseClassifierJson(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

const VALID_LEVELS: ReadonlySet<RiskLevel> = new Set<RiskLevel>([
  'low',
  'medium',
  'high',
  'critical',
]);

/**
 * 解析 AI 输出为 AIClassifierResult。
 * 容忍模型偶尔包裹 ```json``` 代码块的情况。
 */
export function parseClassifierJson(raw: string): AIClassifierResult | null {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();

  // 剥掉可能的 ```json ... ``` 包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }

  // 截取首个 { ... } 块
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonStr = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const level = obj['risk_level'];
  const confidence = obj['confidence'];
  const reasoning = obj['reasoning'];

  if (typeof level !== 'string' || !VALID_LEVELS.has(level as RiskLevel)) {
    return null;
  }
  const conf =
    typeof confidence === 'number' && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0.5;
  const reason = typeof reasoning === 'string' ? reasoning : '';

  return {
    risk_level: level as RiskLevel,
    confidence: conf,
    reasoning: reason,
  };
}

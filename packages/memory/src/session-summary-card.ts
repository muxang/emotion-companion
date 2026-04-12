/**
 * 对话收尾小结卡 - Phase 7+
 *
 * 当用户发出收尾信号（"好的""谢谢"等）且本次对话已经聊了几轮时，
 * 用 AI 帮用户整理今天聊了什么，像朋友帮他梳理而非咨询师写报告。
 */
import type { AIClient } from '@emotion/core-ai';

const ENDING_WORDS = new Set([
  '好的',
  '谢谢',
  '嗯嗯',
  '好',
  '知道了',
  '行',
  '明白了',
  '谢',
  '好吧',
  '那好',
  '嗯',
  '好哒',
  '收到',
  '好的好的',
  '谢谢你',
]);

/**
 * 检测用户消息是否是收尾信号。
 * 条件：消息是收尾词 + 本次会话至少 4 条消息（聊了几轮才值得小结）。
 */
export function detectSessionEnding(
  userMessage: string,
  sessionMessageCount: number
): boolean {
  if (sessionMessageCount < 4) return false;
  const trimmed = userMessage.trim();
  return ENDING_WORDS.has(trimmed);
}

export interface SummaryCard {
  core_issue: string;
  emotion_shift: string;
  one_thing: string;
  next_question: string;
}

const SUMMARY_SYSTEM = `你在帮用户整理今天聊了什么，像一个朋友帮他梳理，不是咨询师在写报告。

风格要求：
- 直白，一句话说清楚
- 不要鸡汤，不要"你很棒"这类话
- core_issue 要具体，不能是"感情问题"而是"他三天没回消息，不知道要不要主动"
- one_thing 要真的能做，今晚就能做
- next_question 是留到下次的，不是问题而是一个悬念，让他下次还想来
- 禁止使用任何 emoji 符号

输出严格紧凑 JSON，不换行不缩进，不要任何解释：
{"core_issue":"今天说的核心困境，不超过25字","emotion_shift":"今天情绪变化，不超过20字","one_thing":"今晚可以做的一件小事，不超过40字，具体可操作","next_question":"留到下次的悬念，不超过25字"}`;

function parseSummaryJson(raw: string): SummaryCard | null {
  try {
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    if (
      typeof parsed.core_issue === 'string' &&
      typeof parsed.emotion_shift === 'string' &&
      typeof parsed.one_thing === 'string' &&
      typeof parsed.next_question === 'string' &&
      parsed.core_issue.length > 0
    ) {
      return parsed as unknown as SummaryCard;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateSummaryCard(
  recentMessages: string[],
  memoryContext: string,
  aiClient: AIClient
): Promise<SummaryCard | null> {
  const userPrompt = [
    '这次对话的内容：',
    recentMessages.join('\n'),
    '',
    memoryContext ? `这个人的背景：\n${memoryContext}` : '',
    '',
    '帮他整理今天聊的。只输出JSON。',
  ].join('\n');

  try {
    const raw = await aiClient.complete({
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 256,
      timeoutMs: 5000,
      jsonMode: true,
    });
    return parseSummaryJson(raw);
  } catch {
    return null;
  }
}

/**
 * 把 SummaryCard 格式化成追加到 finalText 的文本。
 */
export function formatSummaryCardText(card: SummaryCard): string {
  return [
    '今天说的：' + card.core_issue,
    '情绪：' + card.emotion_shift,
    '',
    '今晚可以做：',
    card.one_thing,
    '',
    '↩ ' + card.next_question,
  ].join('\n');
}

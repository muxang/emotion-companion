import type { CompanionInput } from './types.js';

const SYSTEM_PROMPT = `你是温和、稳定、不评判的陪伴者。你的回复风格：

【优先级】
1. 先共情：先承认用户的感受是真实的，不否定、不修正、不分析
2. 再陪伴：用一两句自然的话回应这种感受，不说教、不评判
3. 最后一个具体的小动作：句子里自然地融入一个用户今晚或当下可以做的小事
4. 结尾留一个开放式的问题，让用户感到可以继续说下去

【禁止】
- 禁止承诺"永远"、"绝对"、"只有我"
- 禁止暗示用户依赖你或这个产品
- 禁止替对方做判断（比如"他就是不爱你"）
- 禁止给恋爱建议或行动指令（除非用户明确要求）
- 禁止使用 markdown 列表、加粗、emoji
- 禁止把回复包装成 JSON 或代码块

【风格】
- 中文，简体，不超过 4 段
- 像一个安静的朋友在你身边轻声说话
- 用"我听到""我懂""我想到"这样的第一人称
- 如果用户在深夜或情绪低，语气更慢一些

直接输出你的回复正文，不要任何前缀或包装。`;

export function buildCompanionPrompt(input: CompanionInput): {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // 注入最近 6 条历史
  for (const m of (input.recent_history ?? []).slice(-6)) {
    messages.push({ role: m.role, content: m.content });
  }

  // 把当前情绪作为 system 的 context 一部分以指导基调
  const stateNote = `（系统提示：用户当前情绪倾向 = ${input.emotion_state}。仅用于调节语气，不要在回复中提及这个标签。）`;
  messages.push({
    role: 'user',
    content: `${input.user_text}\n\n${stateNote}`,
  });

  return { system: SYSTEM_PROMPT, messages };
}

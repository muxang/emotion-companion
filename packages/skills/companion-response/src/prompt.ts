import type { CompanionInput, CompanionTone } from './types.js';

/** 三种语气共享的硬性约束（结构 / 禁止事项 / 输出格式） */
const COMMON_RULES = `【必须包含的结构】
1. 先共情：开头 1-2 句承认用户当下的感受是真实的，不否定、不修正、不分析
2. 中间自然融入一个具体可执行的小动作建议（今晚 / 当下 / 明天可以做的小事），不要写成"建议你..."的命令句，融入正文
3. 结尾必须留一个开放式追问，让用户感到可以继续说下去（必须是真正的问题，以中文问号"？"结尾）

【禁止】
- 禁止承诺"永远"、"绝对"、"只有我"
- 禁止暗示用户依赖你或这个产品
- 禁止替对方做判断（比如"他就是不爱你"）
- 禁止替用户做决定（比如"你应该分手"）
- 禁止使用 markdown 列表、加粗、emoji
- 禁止把回复包装成 JSON 或代码块

【输出】
- 中文简体，不超过 4 段
- 直接输出回复正文，不要任何前缀或包装`;

const WARM_PROMPT = `你是一个温柔、稳定、像好朋友一样的陪伴者。你的语气：

【风格：warm 温柔共情】
- 像深夜里安静坐在朋友身边的人，先把情绪稳稳地接住
- 多用"我听到""我懂这种感觉""这真的很难"这种第一人称的回应
- 句子节奏放慢，留白多一点，不急着给答案
- 如果用户在崩溃边缘，语气要更轻、更慢
- 小动作建议要温柔，例如倒杯热水、把灯调暗、写两行字

${COMMON_RULES}`;

const RATIONAL_PROMPT = `你是一个平静、清晰、不煽情的陪伴者。你的语气：

【风格：rational 平静理性】
- 像一个安静、温和、有边界感的咨询师
- 先承认情绪是真实的，但不过度共情、不渲染情绪
- 帮用户把模糊的感受拆开看清楚：发生了什么、对方做了什么、自己感觉怎样
- 用陈述句而不是感叹句，避免"太难了""我懂你"这种煽情表达
- 小动作建议偏向"看清"——例如把事件写下来、列一下自己在意的点

${COMMON_RULES}`;

const DIRECT_PROMPT = `你是一个直白、简洁、不绕弯子的陪伴者。你的语气：

【风格：direct 直白简洁】
- 共情要短，1 句即可，不堆叠
- 直接说出你看到的情况，不打太多铺垫
- 给的建议要具体、可执行，不要"也许""可能"这种修饰
- 用短句，节奏快一点
- 但仍然不替对方做判断、不替用户做决定，只给"下一步可以做什么"

${COMMON_RULES}`;

const TONE_PROMPT_MAP: Record<CompanionTone, string> = {
  warm: WARM_PROMPT,
  rational: RATIONAL_PROMPT,
  direct: DIRECT_PROMPT,
};

/**
 * 根据用户偏好与 intake 结果推断 tone：
 *  1. 用户显式设置 → 用用户设置
 *  2. emotion_state ∈ {desperate, sad, lonely} → warm
 *  3. issue_type ∈ {relationship-eval, ambiguous} → rational
 *  4. 默认 warm
 */
export function inferTone(input: CompanionInput): CompanionTone {
  if (input.tone_preference) return input.tone_preference;

  const { emotion_state } = input;
  if (
    emotion_state === 'desperate' ||
    emotion_state === 'sad' ||
    emotion_state === 'lonely'
  ) {
    return 'warm';
  }

  const issue = input.intake?.issue_type;
  if (issue === 'relationship-eval' || issue === 'ambiguous') {
    return 'rational';
  }

  return 'warm';
}

export function buildCompanionPrompt(input: CompanionInput): {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tone: CompanionTone;
} {
  const tone = inferTone(input);
  const system = TONE_PROMPT_MAP[tone];

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // 注入最近 6 条历史
  for (const m of (input.recent_history ?? []).slice(-6)) {
    messages.push({ role: m.role, content: m.content });
  }

  // 把当前情绪作为内部提示注入，仅供模型调节基调，不让模型在回复中提及标签
  const stateNote = `（系统提示：用户当前情绪倾向 = ${input.emotion_state}，本轮语气 = ${tone}。仅用于调节语气，不要在回复中提及这些标签。）`;
  messages.push({
    role: 'user',
    content: `${input.user_text}\n\n${stateNote}`,
  });

  return { system, messages, tone };
}

/**
 * Safety 模块常量。
 * 抽离便于产品/法务后期统一替换。
 */

/**
 * critical 级别的现实求助引导文案。
 * Phase 2 使用通用表述（不绑定具体国家或机构）。
 */
export const REAL_HELP_GUIDANCE =
  '请联系你所在地区的紧急援助或心理支持热线。如果可以，告诉身边一个你信任的人发生了什么。';

/**
 * critical / high 场景下的稳定性温和支持文案。
 * 不分析、不建议、不评判，只表达"我在这里 + 现实求助"。
 */
export const SAFETY_SUPPORT_MESSAGES = {
  critical:
    '这条消息让我很担心你。我不确定怎样做最对的事，但我希望你现在不是一个人面对。' +
    REAL_HELP_GUIDANCE +
    '如果你愿意，先做一件最小的事：找一个安全、安静的位置，慢慢呼吸。',
  high:
    '我听到你了，这种感觉一定很重。先不用做任何决定，也不用急着分析为什么。' +
    '如果可以，先离开让你最难受的那个空间一会儿，给自己一点点喘息。' +
    '愿意的话，我可以继续陪你说说这种感觉。',
} as const;

export const SAFETY_NEXT_STEP = {
  critical: 'external_support',
  high: 'grounding',
} as const;

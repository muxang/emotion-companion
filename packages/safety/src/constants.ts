/**
 * Safety 模块常量。
 * 抽离便于产品/法务后期统一替换。
 */

/**
 * 危机援助热线列表。
 *
 * 默认包含两条公开的真实热线，支持通过环境变量 CRISIS_HOTLINES_OVERRIDE
 * 整体覆盖（用 `;` 分隔多个条目，便于上线后由运营/法务调整）。
 *
 * Guard 不识别具体号码，只识别"热线"等通用词，所以这里安全地保留号码字面值
 * 不会污染输出守卫的判定。
 */
function loadHotlines(): readonly string[] {
  const override =
    typeof process !== 'undefined'
      ? process.env?.CRISIS_HOTLINES_OVERRIDE
      : undefined;
  if (override && override.trim().length > 0) {
    return override
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [
    '北京心理危机研究与干预中心 010-82951332',
    '全国心理援助热线 400-161-9995',
  ];
}

export const CRISIS_HOTLINES: readonly string[] = loadHotlines();

/**
 * critical 级别的现实求助引导文案。
 * 由通用表述 + 实际热线拼接而成。
 */
export const REAL_HELP_GUIDANCE =
  '请联系你所在地区的紧急援助或心理支持热线（例如：' +
  CRISIS_HOTLINES.join('；') +
  '）。如果可以，告诉身边一个你信任的人发生了什么。';

/**
 * critical 场景统一回复模板。
 * Guard 必须能够通过此模板（即包含 REAL_HELP_PATTERNS 中的关键词）。
 */
export const CRISIS_RESPONSE_TEMPLATE =
  '这条消息让我很担心你。我不确定怎样做最对的事，但我希望你现在不是一个人面对。' +
  REAL_HELP_GUIDANCE +
  '如果你愿意，先做一件最小的事：找一个安全、安静的位置，慢慢呼吸。';

/**
 * critical / high 场景下的稳定性温和支持文案。
 * 不分析、不建议、不评判，只表达"我在这里 + 现实求助"。
 */
export const SAFETY_SUPPORT_MESSAGES = {
  critical: CRISIS_RESPONSE_TEMPLATE,
  high:
    '我听到你了，这种感觉一定很重。先不用做任何决定，也不用急着分析为什么。' +
    '如果可以，先离开让你最难受的那个空间一会儿，给自己一点点喘息。' +
    '愿意的话，我可以继续陪你说说这种感觉。',
} as const;

export const SAFETY_NEXT_STEP = {
  critical: 'external_support',
  high: 'grounding',
} as const;

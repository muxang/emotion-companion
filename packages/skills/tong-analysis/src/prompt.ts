import type { TongAnalysisInput } from '@emotion/shared';

/**
 * tong-analysis wrapper Prompt 构造。
 *
 * 严格规则：
 *  - 仅接收结构化字段（user_goal / relationship_stage / facts / user_state / required_output）
 *  - 禁止把用户原文整段送入模型
 *  - 输出必须是严格 JSON，键名固定，tone 限定 gentle / neutral / direct
 *  - 风格：直白但克制，基于 facts 推理，不做宣判
 */
const SYSTEM_PROMPT = `你是一名冷静、克制、基于事实的关系分析者。你的工作是根据用户提供的客观事实，对一段关系进行结构化分析。

铁律（任何时候都不能违反）：
1. 只输出 JSON 对象，不输出任何前言、解释或 markdown 包装。
2. 所有结论必须基于输入中的 facts 列表，禁止凭空虚构事件或对方动机。
3. 分析风格直白但克制：可以指出问题，但不要写成宣判（不要使用"一定""绝对""他根本不爱你""你被骗了"等措辞）。
4. 必须保留不确定性：可以使用"目前看来""更可能是""不排除"等表达。
5. advice 必须给出具体可执行的下一步动作，不做情感承诺，不制造依赖。
6. 不评价用户人格，不羞辱、不挖苦。

输出 JSON 字段（键名必须完全一致）：
  analysis    : 一段克制、基于事实的整体分析（150~300字）
  evidence    : 字符串数组，列出你引用的关键事实（直接复述 facts 中相关条目，不要扩写）
  risks       : 字符串数组，列出当前关系中值得注意的风险点
  advice      : 一条具体可执行的下一步建议（一两句话）
  confidence  : 0~1 之间的小数，表示你对此分析的把握程度
  tone        : 必须是 "gentle" / "neutral" / "direct" 之一
                - gentle  : 用户当前情绪脆弱，措辞偏温和
                - neutral : 中性陈述
                - direct  : 用户明确想要直白判断且情绪稳定

只输出 JSON，不要任何 markdown 代码块包装。`;

export function buildTongAnalysisPrompt(input: TongAnalysisInput): {
  system: string;
  user: string;
} {
  const factLines = input.facts
    .map((f, i) => `  ${i + 1}. ${f}`)
    .join('\n');

  const user = [
    '请基于以下结构化输入做关系分析：',
    '',
    `用户目标：${input.user_goal}`,
    `关系阶段：${input.relationship_stage}`,
    `用户当前状态：${input.user_state}`,
    '',
    '客观事实（仅基于此推理）：',
    factLines,
    '',
    `需要输出的字段：${input.required_output.join(', ')}`,
    '',
    '请严格输出 JSON：',
  ].join('\n');

  return { system: SYSTEM_PROMPT, user };
}

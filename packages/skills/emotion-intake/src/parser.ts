import { IntakeResultSchema, type IntakeResultParsed } from '@emotion/shared';

/**
 * 解析模型原始输出为 IntakeResult。
 * 严格使用 Zod 校验，不通过则抛错。
 */
export function parseIntakeOutput(raw: string): IntakeResultParsed {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `emotion-intake parser: invalid JSON: ${(err as Error).message}`
    );
  }
  return IntakeResultSchema.parse(json);
}

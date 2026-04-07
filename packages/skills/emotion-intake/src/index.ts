/**
 * Emotion Intake Skill
 *
 * Phase 0：仅导出骨架。Phase 2 实现完整逻辑（调用 core-ai → 解析 → 返回）。
 */

export { buildIntakePrompt } from './prompt.js';
export { parseIntakeOutput } from './parser.js';
export type { EmotionIntakeInput, EmotionIntakeOutput } from './types.js';

import { buildIntakePrompt } from './prompt.js';
import { parseIntakeOutput } from './parser.js';
import type { EmotionIntakeInput, EmotionIntakeOutput } from './types.js';

/**
 * 占位：实际调用模型的逻辑将在 Phase 2 接入 packages/core-ai 后完成。
 */
export async function runEmotionIntake(
  _input: EmotionIntakeInput
): Promise<EmotionIntakeOutput> {
  throw new Error('runEmotionIntake not implemented (Phase 2)');
}

// 防止 noUnusedLocals 在 Phase 0 报错
void buildIntakePrompt;
void parseIntakeOutput;

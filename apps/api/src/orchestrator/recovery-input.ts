/**
 * Phase 6: 把 RecoveryTask 拼接为流式回放文本。
 *
 * 输出格式（保持温和、可读，避免堆 emoji）：
 *
 *   **第 N 天的小任务**
 *   {task}
 *
 *   ✏️ 反思：{reflection_prompt}
 *
 *   {encouragement}
 */
import type { RecoveryTask } from '@emotion/shared';

export function formatRecoveryText(task: RecoveryTask): string {
  const lines = [
    `**第 ${task.day_index} 天的小任务**`,
    task.task.trim(),
    '',
    `✏️ 反思：${task.reflection_prompt.trim()}`,
    '',
    task.encouragement.trim(),
  ];
  return lines.join('\n');
}

/** 当用户没有 active 计划时的引导文案 */
export const NO_ACTIVE_PLAN_TEXT =
  '你还没有正在进行的恢复计划。我可以陪你建立一个 7 天分手恢复计划，' +
  '或一个 14 天反内耗计划——去成长页选一个开始，我们一天走一小步。';

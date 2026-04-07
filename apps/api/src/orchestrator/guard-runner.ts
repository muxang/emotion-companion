/**
 * Guard 包装器：跑 Final Response Guard，失败时由调用方传入 regenerate 重试一次。
 *
 * 决策点 #5：第一次 fail → 重试 → 第二次仍 fail：warn 日志 + 输出第二次内容。
 *           不回退到第一次内容。
 */
import { runFinalResponseGuard, type GuardCheckResult } from '@emotion/core-ai';
import type { ConversationMode, RiskLevel } from '@emotion/shared';

export interface GuardRunResult {
  finalText: string;
  firstFailed: string[];
  secondFailed: string[];
  emittedAnyway: boolean;
}

export interface GuardRunInput {
  firstText: string;
  risk_level: RiskLevel;
  mode: ConversationMode;
  /** 调用者用于重新跑一次 skill 并 collect 出第二段全文 */
  regenerate: () => Promise<string>;
  logger: {
    warn: (obj: Record<string, unknown>, msg?: string) => void;
  };
}

export async function runGuardWithRetry(
  input: GuardRunInput
): Promise<GuardRunResult> {
  const first = check(input.firstText, input.risk_level, input.mode);
  if (first.passed) {
    return {
      finalText: input.firstText,
      firstFailed: [],
      secondFailed: [],
      emittedAnyway: false,
    };
  }

  // 重试一次
  const secondText = await input.regenerate();
  const second = check(secondText, input.risk_level, input.mode);

  if (second.passed) {
    return {
      finalText: secondText,
      firstFailed: first.failed_checks,
      secondFailed: [],
      emittedAnyway: false,
    };
  }

  // 二次仍失败：记 warn，输出第二次内容（不回退到第一次）
  input.logger.warn(
    {
      first_failed: first.failed_checks,
      second_failed: second.failed_checks,
    },
    'guard failed twice, emitting second attempt as-is'
  );
  return {
    finalText: secondText,
    firstFailed: first.failed_checks,
    secondFailed: second.failed_checks,
    emittedAnyway: true,
  };
}

function check(
  text: string,
  risk: RiskLevel,
  mode: ConversationMode
): GuardCheckResult {
  return runFinalResponseGuard({
    reply: text,
    risk_level: risk,
    mode,
  });
}

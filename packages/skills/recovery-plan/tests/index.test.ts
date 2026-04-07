import { describe, it, expect, vi } from 'vitest';
import {
  buildRecoveryPlanPrompt,
  parseRecoveryPlanOutput,
  makeSafeDefaultTask,
  runRecoveryPlan,
  BlockedByRiskError,
} from '../src/index.js';
import type { RecoveryPlanDeps } from '../src/index.js';

function makeFakeAi(reply: string): RecoveryPlanDeps['ai'] {
  return {
    getModel: () => 'fake',
    async complete() {
      return reply;
    },
    streamText() {
      throw new Error('not used');
    },
  } as unknown as RecoveryPlanDeps['ai'];
}

describe('recovery-plan prompt', () => {
  it('emits 7day-breakup theme for 7day plans', () => {
    const { user } = buildRecoveryPlanPrompt({
      plan_type: '7day-breakup',
      day_index: 1,
    });
    expect(user).toContain('7day-breakup');
    expect(user).toContain('第 1 天');
  });

  it('emits 14day-rumination theme for 14day plans', () => {
    const { user } = buildRecoveryPlanPrompt({
      plan_type: '14day-rumination',
      day_index: 5,
      user_state: '一直在反复想他',
    });
    expect(user).toContain('14day-rumination');
    expect(user).toContain('第 5 天');
    expect(user).toContain('反复想他');
  });
});

describe('recovery-plan parser', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({
      task: '出门散步 20 分钟',
      reflection_prompt: '走完后，注意一下身体最先松下来的地方',
      encouragement: '你今天已经完成一件具体的事',
    });
    const out = parseRecoveryPlanOutput(raw, 3);
    expect(out.day_index).toBe(3);
    expect(out.task).toBe('出门散步 20 分钟');
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const raw =
      '```json\n{"task":"喝杯水","reflection_prompt":"留意一下口腔的感觉","encouragement":"先照顾好自己"}\n```';
    const out = parseRecoveryPlanOutput(raw, 2);
    expect(out.task).toBe('喝杯水');
  });

  it('falls back to safe default on invalid JSON', () => {
    const out = parseRecoveryPlanOutput('not a json at all', 4);
    expect(out).toEqual(makeSafeDefaultTask(4));
  });

  it('falls back to safe default when fields are missing', () => {
    const out = parseRecoveryPlanOutput('{"task":"x"}', 1);
    expect(out).toEqual(makeSafeDefaultTask(1));
  });
});

describe('runRecoveryPlan', () => {
  it('returns parsed task on success', async () => {
    const ai = makeFakeAi(
      JSON.stringify({
        task: '今天整理书桌一角',
        reflection_prompt: '收拾完后，留意一下视觉上的变化',
        encouragement: '一点点小整洁也算前进',
      })
    );
    const out = await runRecoveryPlan(
      { plan_type: '7day-breakup', day_index: 1 },
      { ai, risk_level: 'low' }
    );
    expect(out.day_index).toBe(1);
    expect(out.task).toContain('整理书桌');
  });

  it('falls back to safe default when AI throws', async () => {
    const ai = {
      getModel: () => 'fake',
      async complete() {
        throw new Error('boom');
      },
      streamText() {
        throw new Error('not used');
      },
    } as unknown as RecoveryPlanDeps['ai'];

    const out = await runRecoveryPlan(
      { plan_type: '14day-rumination', day_index: 7 },
      { ai, risk_level: 'medium' }
    );
    expect(out).toEqual(makeSafeDefaultTask(7));
  });

  it('throws BlockedByRiskError when risk_level is critical', async () => {
    const completeSpy = vi.fn();
    const ai = {
      getModel: () => 'fake',
      complete: completeSpy,
      streamText() {
        throw new Error('not used');
      },
    } as unknown as RecoveryPlanDeps['ai'];

    await expect(
      runRecoveryPlan(
        { plan_type: '7day-breakup', day_index: 1 },
        { ai, risk_level: 'critical' }
      )
    ).rejects.toBeInstanceOf(BlockedByRiskError);
    expect(completeSpy).not.toHaveBeenCalled();
  });
});

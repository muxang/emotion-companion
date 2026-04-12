import { describe, it, expect, vi } from 'vitest';
import {
  detectSessionEnding,
  generateSummaryCard,
  formatSummaryCardText,
} from '../src/session-summary-card.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeAI(reply: string | (() => Promise<string>)): any {
  return {
    complete: vi.fn(async () => (typeof reply === 'function' ? reply() : reply)),
    streamText: () => ({ async *[Symbol.asyncIterator]() {} }),
    provider: 'fake',
    model: 'fake',
  };
}

describe('detectSessionEnding', () => {
  it('"好的" + >=4条 → true', () => {
    expect(detectSessionEnding('好的', 4)).toBe(true);
  });

  it('"谢谢" + >=4条 → true', () => {
    expect(detectSessionEnding('谢谢', 6)).toBe(true);
  });

  it('"好的" + 2条 → false（对话太短）', () => {
    expect(detectSessionEnding('好的', 2)).toBe(false);
  });

  it('普通消息 + 4条 → false（不是收尾词）', () => {
    expect(detectSessionEnding('他今天又没回消息', 4)).toBe(false);
  });

  it('"嗯嗯" + 5条 → true', () => {
    expect(detectSessionEnding('嗯嗯', 5)).toBe(true);
  });
});

describe('generateSummaryCard', () => {
  it('正常调用：JSON 解析正确', async () => {
    const ai = fakeAI(
      JSON.stringify({
        core_issue: '他三天没回消息',
        emotion_shift: '从焦虑到平静',
        one_thing: '今晚写下三件今天做到的事',
        next_question: '明天如果他回了，你打算怎么说',
      })
    );
    const result = await generateSummaryCard(
      ['用户消息1', '助手回复1'],
      '',
      ai
    );
    expect(result).not.toBeNull();
    expect(result!.core_issue).toBe('他三天没回消息');
    expect(result!.one_thing).toContain('三件');
  });

  it('AI 超时 → 返回 null', async () => {
    const ai = fakeAI(async () => {
      throw new Error('timeout');
    });
    const result = await generateSummaryCard(['消息'], '', ai);
    expect(result).toBeNull();
  });

  it('JSON 解析失败 → 返回 null', async () => {
    const ai = fakeAI('这不是JSON');
    const result = await generateSummaryCard(['消息'], '', ai);
    expect(result).toBeNull();
  });
});

describe('formatSummaryCardText', () => {
  it('格式化输出包含四段', () => {
    const text = formatSummaryCardText({
      core_issue: '他不回消息',
      emotion_shift: '从焦虑到平静',
      one_thing: '写日记',
      next_question: '明天他回了怎么办',
    });
    expect(text).toContain('今天说的：他不回消息');
    expect(text).toContain('情绪：从焦虑到平静');
    expect(text).toContain('写日记');
    expect(text).toContain('↩ 明天他回了怎么办');
  });
});

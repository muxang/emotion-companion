import { describe, it, expect } from 'vitest';
import {
  buildCompanionPrompt,
  finalizeCompanionText,
  COMPANION_EMPTY_FALLBACK,
  runCompanionResponse,
} from '../src/index.js';
import type { AIClient } from '@emotion/core-ai';

// ============================================================
// buildCompanionPrompt — 系统 prompt 内容校验
// ============================================================

describe('companion-response.buildCompanionPrompt — 童锦程框架 prompt', () => {
  it('系统 prompt 包含 5 个心智模型关键词', () => {
    const { system } = buildCompanionPrompt({
      user_text: '他突然冷淡了我',
      emotion_state: 'anxious',
    });
    expect(system).toContain('吸引力原则');
    expect(system).toContain('给台阶');
    expect(system).toContain('人性不可考验');
    expect(system).toContain('自我炫耀即自我暴露');
    expect(system).toContain('社会现实是条件性的');
  });

  it('系统 prompt 包含童式口语化开场标记', () => {
    const { system } = buildCompanionPrompt({
      user_text: '我不知道怎么办',
      emotion_state: 'confused',
    });
    expect(system).toContain('说白了');
    expect(system).toContain('你听我说');
  });

  it('系统 prompt 要求开放式追问结尾以"？"结尾', () => {
    const { system } = buildCompanionPrompt({
      user_text: '分手了我很难受',
      emotion_state: 'sad',
    });
    expect(system).toContain('开放式追问');
    expect(system).toContain('？');
  });

  it('系统 prompt 禁止鸡汤措辞', () => {
    const { system } = buildCompanionPrompt({
      user_text: '随便',
      emotion_state: 'mixed',
    });
    expect(system).toContain('鸡汤');
    expect(system).toContain('相信自己');
  });

  it('系统 prompt 包含安全约束：不做绝对承诺、不制造依赖', () => {
    const { system } = buildCompanionPrompt({
      user_text: '我好累',
      emotion_state: 'numb',
    });
    expect(system).toContain('永远');
    expect(system).toContain('只有我');
    expect(system).toContain('依赖');
  });

  it('系统 prompt 标注 risk_level >= high 时不应调用此 prompt', () => {
    const { system } = buildCompanionPrompt({
      user_text: '随便',
      emotion_state: 'mixed',
    });
    expect(system).toContain('risk_level');
    expect(system).toContain('safety');
  });

  it('禁止 markdown / JSON 包装的文字写在 prompt 里', () => {
    const { system } = buildCompanionPrompt({
      user_text: '随便',
      emotion_state: 'mixed',
    });
    expect(system).toContain('markdown');
    expect(system).toContain('JSON');
  });
});

// ============================================================
// buildCompanionPrompt — 上下文注入
// ============================================================

describe('companion-response.buildCompanionPrompt — 上下文注入', () => {
  it('用户文本和情绪标签都注入到最后一条消息', () => {
    const { messages } = buildCompanionPrompt({
      user_text: '他最近老是已读不回',
      emotion_state: 'anxious',
    });
    const last = messages[messages.length - 1]?.content ?? '';
    expect(last).toContain('他最近老是已读不回');
    expect(last).toContain('anxious');
  });

  it('历史消息注入，最多取最近 6 条', () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `m${i}`,
    }));
    const { messages } = buildCompanionPrompt({
      user_text: '今天又发生了',
      emotion_state: 'sad',
      recent_history: history,
    });
    // 6 条历史 + 1 条当前 user_text
    expect(messages).toHaveLength(7);
    expect(messages[0]?.content).toBe('m2');
    expect(messages[5]?.content).toBe('m7');
  });

  it('有 memory_context 时注入到 system prompt', () => {
    const { system } = buildCompanionPrompt({
      user_text: '他又联系我了',
      emotion_state: 'mixed',
      memory_context: '用户与前男友分手三个月，曾经异地三年',
    });
    expect(system).toContain('用户与前男友分手三个月');
    expect(system).toContain('已知长期上下文');
  });

  it('memory_context 为空字符串时不注入', () => {
    const { system } = buildCompanionPrompt({
      user_text: '随便',
      emotion_state: 'mixed',
      memory_context: '',
    });
    expect(system).not.toContain('已知长期上下文');
  });

  it('无 recent_history 时 messages 只有 1 条（当前 user_text）', () => {
    const { messages } = buildCompanionPrompt({
      user_text: '只有一条消息',
      emotion_state: 'lonely',
    });
    expect(messages).toHaveLength(1);
  });
});

// ============================================================
// finalizeCompanionText
// ============================================================

describe('companion-response.finalizeCompanionText', () => {
  it('正常文本 trim 后原样返回', () => {
    expect(finalizeCompanionText('  你好  ')).toBe('你好');
  });

  it('空字符串返回 fallback', () => {
    expect(finalizeCompanionText('')).toBe(COMPANION_EMPTY_FALLBACK);
  });

  it('纯空白返回 fallback', () => {
    expect(finalizeCompanionText('   \n\t  ')).toBe(COMPANION_EMPTY_FALLBACK);
  });

  it('fallback 本身以开放式追问"？"结尾', () => {
    expect(COMPANION_EMPTY_FALLBACK).toContain('？');
  });
});

// ============================================================
// runCompanionResponse
// ============================================================

describe('companion-response.runCompanionResponse', () => {
  it('返回 AsyncIterable，正常产出 AI 块', async () => {
    const ai = {
      complete: async () => '',
      streamText: () => ({
        async *[Symbol.asyncIterator]() {
          yield '说白了兄弟，';
          yield '你现在最需要的是';
          yield '把注意力拉回自己身上。';
        },
      }),
      provider: 'fake',
      model: 'fake',
    } as unknown as AIClient;

    const stream = runCompanionResponse(
      { user_text: '他不理我了', emotion_state: 'anxious' },
      { ai }
    );
    let acc = '';
    for await (const chunk of stream) acc += chunk;
    expect(acc).toBe('说白了兄弟，你现在最需要的是把注意力拉回自己身上。');
  });
});

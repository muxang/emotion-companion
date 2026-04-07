import { describe, it, expect, vi } from 'vitest';
import {
  parseClassifierJson,
  runAIClassifier,
  type AIClassifierClient,
} from '../src/ai-classifier.js';

function makeClient(impl: AIClassifierClient['complete']): AIClassifierClient {
  return { complete: impl };
}

describe('parseClassifierJson', () => {
  it('解析合法 JSON', () => {
    const r = parseClassifierJson(
      '{"risk_level":"high","confidence":0.9,"reasoning":"明显失控"}'
    );
    expect(r).toEqual({
      risk_level: 'high',
      confidence: 0.9,
      reasoning: '明显失控',
    });
  });

  it('容忍 ```json 包裹', () => {
    const r = parseClassifierJson(
      '```json\n{"risk_level":"low","confidence":0.8,"reasoning":""}\n```'
    );
    expect(r?.risk_level).toBe('low');
  });

  it('容忍前后带文本', () => {
    const r = parseClassifierJson(
      '分类结果如下: {"risk_level":"medium","confidence":0.7,"reasoning":"反复内耗"} 谢谢'
    );
    expect(r?.risk_level).toBe('medium');
  });

  it('非法 risk_level 返回 null', () => {
    const r = parseClassifierJson(
      '{"risk_level":"insane","confidence":0.5,"reasoning":""}'
    );
    expect(r).toBeNull();
  });

  it('完全非 JSON 返回 null', () => {
    expect(parseClassifierJson('hello world')).toBeNull();
  });

  it('空字符串返回 null', () => {
    expect(parseClassifierJson('')).toBeNull();
  });

  it('confidence 越界自动截断', () => {
    const r = parseClassifierJson(
      '{"risk_level":"low","confidence":2.5,"reasoning":""}'
    );
    expect(r?.confidence).toBe(1);
  });

  it('confidence 缺失时回退 0.5', () => {
    const r = parseClassifierJson(
      '{"risk_level":"low","reasoning":"x"}'
    );
    expect(r?.confidence).toBe(0.5);
  });
});

describe('runAIClassifier', () => {
  it('AI 返回合法 JSON 时返回结构化结果', async () => {
    const client = makeClient(
      vi.fn().mockResolvedValue(
        '{"risk_level":"high","confidence":0.95,"reasoning":"明显伤害意图"}'
      )
    );
    const r = await runAIClassifier('我想伤害自己', client);
    expect(r?.risk_level).toBe('high');
    expect(r?.confidence).toBeCloseTo(0.95);
  });

  it('AI 抛错 → 返回 null（由调用方回退）', async () => {
    const client = makeClient(
      vi.fn().mockRejectedValue(new Error('upstream 500'))
    );
    const r = await runAIClassifier('我有点累', client);
    expect(r).toBeNull();
  });

  it('AI 返回非 JSON → 返回 null', async () => {
    const client = makeClient(
      vi.fn().mockResolvedValue('我觉得用户应该 high 风险')
    );
    const r = await runAIClassifier('我有点累', client);
    expect(r).toBeNull();
  });

  it('AI 超时 → 返回 null', async () => {
    const client = makeClient(
      // 永不 resolve（模拟挂起）
      vi.fn().mockImplementation(
        () => new Promise<string>(() => {
          /* never resolves */
        })
      )
    );
    const r = await runAIClassifier('我有点累', client, { timeoutMs: 50 });
    expect(r).toBeNull();
  });

  it('外部 abort → 返回 null', async () => {
    const ac = new AbortController();
    const client = makeClient(
      vi.fn().mockImplementation(
        (opts: { signal?: AbortSignal }) =>
          new Promise<string>((_, reject) => {
            opts.signal?.addEventListener('abort', () =>
              reject(new Error('aborted'))
            );
          })
      )
    );
    const p = runAIClassifier('文本', client, { signal: ac.signal });
    ac.abort();
    const r = await p;
    expect(r).toBeNull();
  });
});

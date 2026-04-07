import { describe, it, expect } from 'vitest';
import { runSafetyTriage } from '../src/index.js';

describe('safety-triage skill (Phase 2)', () => {
  it('returns critical meta + non-empty stream for "我不想活了"', async () => {
    const { meta, stream } = runSafetyTriage({ user_text: '我不想活了' });
    expect(meta.risk_level).toBe('critical');
    expect(meta.safe_mode).toBe(true);
    expect(meta.block_analysis).toBe(true);
    let acc = '';
    for await (const ch of stream) acc += ch;
    expect(acc.length).toBeGreaterThan(20);
  });

  it('returns high meta for "我快崩溃了"', async () => {
    const { meta, stream } = runSafetyTriage({ user_text: '我快崩溃了' });
    expect(meta.risk_level).toBe('high');
    expect(meta.block_analysis).toBe(true);
    let acc = '';
    for await (const ch of stream) acc += ch;
    expect(acc.length).toBeGreaterThan(20);
  });

  it('returns low meta with empty stream for normal text', async () => {
    const { meta, stream } = runSafetyTriage({ user_text: '今天有点累' });
    expect(meta.risk_level).toBe('low');
    expect(meta.safe_mode).toBe(false);
    let acc = '';
    for await (const ch of stream) acc += ch;
    expect(acc).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { classifyByKeywords, isAtLeast } from '../src/classifier.js';
import { canRunAnalysis, allowedModes } from '../src/rules.js';

describe('safety/classifier (Phase 0 skeleton)', () => {
  it('detects critical keywords', () => {
    expect(classifyByKeywords('我不想活了')).toBe('critical');
  });

  it('detects high keywords', () => {
    expect(classifyByKeywords('我快崩溃了')).toBe('high');
  });

  it('returns low for neutral text', () => {
    expect(classifyByKeywords('今天天气还行')).toBe('low');
  });

  it('isAtLeast compares risk levels correctly', () => {
    expect(isAtLeast('critical', 'high')).toBe(true);
    expect(isAtLeast('medium', 'high')).toBe(false);
    expect(isAtLeast('high', 'high')).toBe(true);
  });
});

describe('safety/rules (Phase 0 skeleton)', () => {
  it('blocks analysis at high risk', () => {
    expect(canRunAnalysis('high')).toBe(false);
    expect(canRunAnalysis('critical')).toBe(false);
  });

  it('allows analysis at low/medium', () => {
    expect(canRunAnalysis('low')).toBe(true);
    expect(canRunAnalysis('medium')).toBe(true);
  });

  it('only allows safety mode at high risk', () => {
    expect(allowedModes('critical')).toEqual(['safety']);
    expect(allowedModes('high')).toEqual(['safety']);
  });

  it('allows all modes at low risk', () => {
    expect(allowedModes('low')).toContain('companion');
    expect(allowedModes('low')).toContain('analysis');
  });
});

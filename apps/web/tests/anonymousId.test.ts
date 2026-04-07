import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAnonymousId,
  getOrCreateAnonymousId,
  readAnonymousId,
} from '../src/utils/anonymousId.js';

describe('anonymousId utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a new id on first call and persists it', () => {
    const id = getOrCreateAnonymousId();
    expect(id).toBeTruthy();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(readAnonymousId()).toBe(id);
  });

  it('reuses the persisted id across calls', () => {
    const a = getOrCreateAnonymousId();
    const b = getOrCreateAnonymousId();
    expect(a).toBe(b);
  });

  it('clears the persisted id', () => {
    getOrCreateAnonymousId();
    clearAnonymousId();
    expect(readAnonymousId()).toBeNull();
  });
});

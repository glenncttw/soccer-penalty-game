import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadKeeperLevel, nextKeeperLevel, saveKeeperLevel } from './keeperLevel';

describe('keeper level', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cycles easy, normal, hard', () => {
    expect(nextKeeperLevel('easy')).toBe('normal');
    expect(nextKeeperLevel('normal')).toBe('hard');
    expect(nextKeeperLevel('hard')).toBe('easy');
  });

  it('remembers the level, and starts on normal', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    expect(loadKeeperLevel()).toBe('normal');
    saveKeeperLevel('hard');
    expect(loadKeeperLevel()).toBe('hard');
    store.set('penalty:keeper', 'impossible');
    expect(loadKeeperLevel()).toBe('normal');
  });

  it('copes without storage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadKeeperLevel()).toBe('normal');
    expect(() => saveKeeperLevel('easy')).not.toThrow();
  });
});

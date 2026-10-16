import { describe, expect, it } from 'vitest';
import { SlowMotion } from './slowMotion';

describe('SlowMotion', () => {
  it('runs at full speed until triggered', () => {
    expect(new SlowMotion().update(0.016)).toBeCloseTo(0.016);
  });

  it('holds the slow speed, then eases back to full speed', () => {
    const slow = new SlowMotion();
    slow.trigger(0.3, 0.35, 0.6);
    expect(slow.update(0.1)).toBeCloseTo(0.03); // 0.1 real seconds = 0.03 game seconds
    let real = 0.1;
    while (slow.scale < 1 && real < 5) {
      slow.update(0.01);
      real += 0.01;
    }
    expect(real).toBeGreaterThan(0.35 + 0.4);
    expect(real).toBeLessThan(0.35 + 0.6 + 0.05);
    expect(slow.update(0.016)).toBeCloseTo(0.016);
  });

  it('keeps the slowest speed when triggered again', () => {
    const slow = new SlowMotion();
    slow.trigger(0.3, 0.35, 0.6);
    slow.trigger(0.5, 0.1, 0.6);
    expect(slow.scale).toBe(0.3);
  });
});

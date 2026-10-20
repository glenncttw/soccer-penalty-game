import { describe, expect, it } from 'vitest';
import { bokehPattern, softnessAt } from './depthOfField';

describe('depth of field', () => {
  it('keeps things sharp up to a distance, then softens them over the fade distance', () => {
    expect(softnessAt(10, 15, 10)).toBe(0);
    expect(softnessAt(20, 15, 10)).toBeCloseTo(0.5);
    expect(softnessAt(40, 15, 10)).toBe(1);
  });

  it('reads spots spread over a round disc', () => {
    const pattern = bokehPattern(24);
    expect(pattern).toHaveLength(24);
    for (const p of pattern) expect(p.length()).toBeLessThanOrEqual(1);
    const middle = pattern.reduce((sum, p) => sum.add(p), pattern[0].clone().multiplyScalar(0));
    expect(middle.length() / pattern.length).toBeLessThan(0.05); // no side gets more than the other
  });
});

import { describe, expect, it } from 'vitest';
import { bokehPattern, crowdSoftness } from './depthOfField';
import { DEPTH_OF_FIELD_SETTINGS } from './depthOfFieldSettings';

describe('depth of field', () => {
  it('blurs near people less than far ones, changing smoothly in between', () => {
    const s = { ...DEPTH_OF_FIELD_SETTINGS, nearBlur: 0.4, nearDistance: 10, farDistance: 20 };
    expect(crowdSoftness(5, s)).toBeCloseTo(0.4);
    expect(crowdSoftness(15, s)).toBeCloseTo(0.7);
    expect(crowdSoftness(30, s)).toBeCloseTo(1);
  });

  it('reads spots spread over a round disc', () => {
    const pattern = bokehPattern(24);
    expect(pattern).toHaveLength(24);
    for (const p of pattern) expect(p.length()).toBeLessThanOrEqual(1);
    const middle = pattern.reduce((sum, p) => sum.add(p), pattern[0].clone().multiplyScalar(0));
    expect(middle.length() / pattern.length).toBeLessThan(0.05); // no side gets more than the other
  });
});

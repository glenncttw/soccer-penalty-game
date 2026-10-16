import { describe, expect, it } from 'vitest';
import { createPowerMeter, POWER_MIN, strikeQuality } from './power';

describe('PowerMeter', () => {
  it('sweeps up, bounces off full and counts sweeps', () => {
    const meter = createPowerMeter(false);
    for (let i = 0; i < 60; i++) meter.update(1 / 60); // one second
    expect(meter.value).toBeLessThan(1);
    expect(meter.value).toBeGreaterThan(POWER_MIN);
    for (let i = 0; i < 120; i++) meter.update(1 / 60);
    expect(meter.sweeps).toBe(1);
  });

  it('moves slower on touch screens', () => {
    const mouse = createPowerMeter(false);
    const touch = createPowerMeter(true);
    mouse.update(0.3);
    touch.update(0.3);
    expect(touch.value).toBeLessThan(mouse.value);
    expect((touch.value - POWER_MIN) / (mouse.value - POWER_MIN)).toBeCloseTo(1 / 1.3);
  });

  it('rates the release', () => {
    expect(strikeQuality(0.87)).toBe('perfect');
    expect(strikeQuality(0.97)).toBe('skied');
    expect(strikeQuality(0.3)).toBe('weak');
    expect(strikeQuality(0.7)).toBe('good');
  });
});

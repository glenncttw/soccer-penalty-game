import { describe, expect, it } from 'vitest';
import { PowerMeter, strikeQuality } from './power';
import { shapeShot } from './shot';

const aim = { x: 1, y: 1.5, z: 0 };
const noRandom = () => 0.5;

describe('strikeQuality', () => {
  it('rates the gold zone as perfect', () => {
    expect(strikeQuality(0.87)).toBe('perfect');
    expect(strikeQuality(0.97)).toBe('skied');
    expect(strikeQuality(0.3)).toBe('weak');
    expect(strikeQuality(0.7)).toBe('good');
  });
});

describe('PowerMeter', () => {
  it('sweeps up to full and back down', () => {
    const m = new PowerMeter();
    for (let i = 0; i < 50; i++) m.update(0.02);
    expect(m.value).toBeLessThan(1);
    for (let i = 0; i < 200; i++) m.update(0.02);
    expect(m.sweeps).toBeGreaterThan(0);
  });
});

describe('shapeShot', () => {
  it('keeps a perfect strike on target and fastest', () => {
    const perfect = shapeShot({ aim, power: 0.87, curl: 0 }, noRandom);
    const good = shapeShot({ aim, power: 0.7, curl: 0 }, noRandom);
    expect(perfect.target).toEqual(aim);
    expect(perfect.speed).toBeGreaterThan(good.speed);
  });

  it('sends an overhit shot high', () => {
    const shot = shapeShot({ aim, power: 1, curl: 0 }, noRandom);
    expect(shot.target.y).toBeGreaterThan(aim.y + 1);
  });

  it('turns a rightward drag into rightward bend spin', () => {
    expect(shapeShot({ aim, power: 0.87, curl: 1 }, noRandom).spin.y).toBeLessThan(0);
    expect(shapeShot({ aim, power: 0.87, curl: -1 }, noRandom).spin.y).toBeGreaterThan(0);
  });
});

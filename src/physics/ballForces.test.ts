import { describe, expect, it } from 'vitest';
import { aeroForce } from './ballForces';

const R = 0.11;

describe('aeroForce', () => {
  it('is zero for a ball at rest', () => {
    const f = aeroForce({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, R);
    expect(Math.hypot(f.x, f.y, f.z)).toBe(0);
  });

  it('opposes motion when there is no spin', () => {
    const f = aeroForce({ x: 0, y: 0, z: -25 }, { x: 0, y: 0, z: 0 }, R);
    expect(f.z).toBeGreaterThan(0);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
  });

  it('curls a ball with sidespin sideways', () => {
    // Shooting toward -z with spin around +y bends the ball toward -x (left).
    const left = aeroForce({ x: 0, y: 0, z: -25 }, { x: 0, y: 60, z: 0 }, R);
    expect(left.x).toBeLessThan(0);
    const right = aeroForce({ x: 0, y: 0, z: -25 }, { x: 0, y: -60, z: 0 }, R);
    expect(right.x).toBeGreaterThan(0);
  });

  it('dips a ball with topspin', () => {
    // Topspin for a ball moving toward -z is spin around -x.
    const f = aeroForce({ x: 0, y: 0, z: -25 }, { x: -60, y: 0, z: 0 }, R);
    expect(f.y).toBeLessThan(0);
  });
});

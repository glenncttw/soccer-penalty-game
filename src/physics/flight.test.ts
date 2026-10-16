import { describe, expect, it } from 'vitest';
import { crossingPoint, simulateFlight, solveKick } from './flight';

const start = { x: 0, y: 0.11, z: 11 };
const noSpin = { x: 0, y: 0, z: 0 };

describe('solveKick', () => {
  it('hits the target without spin', () => {
    const target = { x: 2.5, y: 1.8, z: 0 };
    const v = solveKick(start, target, 25, noSpin);
    const hit = crossingPoint(start, v, noSpin, 0)!;
    expect(hit.x).toBeCloseTo(target.x, 1);
    expect(hit.y).toBeCloseTo(target.y, 1);
  });

  it('still hits the target with heavy curl', () => {
    const target = { x: -3, y: 2, z: 0 };
    const spin = { x: 0, y: -50, z: 0 };
    const v = solveKick(start, target, 22, spin);
    const hit = crossingPoint(start, v, spin, 0)!;
    expect(hit.x).toBeCloseTo(target.x, 1);
    expect(hit.y).toBeCloseTo(target.y, 1);
  });

  it('makes a curled shot bow out on the opposite side of its bend', () => {
    // Spin around -y bends the ball to the right, so it must start out to the left.
    const target = { x: 0, y: 1, z: 0 };
    const spin = { x: 0, y: -50, z: 0 };
    const v = solveKick(start, target, 22, spin);
    let midX = 0;
    simulateFlight(start, v, spin, (p) => {
      if (p.z <= 5.5) {
        midX = p.x;
        return true;
      }
      return false;
    });
    expect(midX).toBeLessThan(-0.3);
  });
});

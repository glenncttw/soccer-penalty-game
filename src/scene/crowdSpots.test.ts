import { describe, expect, it } from 'vitest';
import { findCrowdSpots } from './crowdSpots';

/** Two triangles for a flat rectangle at height y. */
function floor(x0: number, z0: number, x1: number, z1: number, y: number): number[] {
  return [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
}

/** Two triangles for an upright wall from (x0, z0) to (x1, z1), between heights y0 and y1. */
function wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): number[] {
  return [x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0];
}

/** A square ring of floor around the middle (inside 2.4 m, outside 3 m from it), on its four sides. */
function ringFloor(y: number, inner: number, outer: number): number[] {
  return [
    ...floor(-outer, -outer, outer, -inner, y), // north
    ...floor(-outer, inner, outer, outer, y), // south
    ...floor(-outer, -inner, -inner, inner, y), // west
    ...floor(inner, -inner, outer, inner, y), // east
  ];
}

function ringWall(d: number, y0: number, y1: number): number[] {
  return [
    ...wall(-d, -d, d, -d, y0, y1),
    ...wall(d, -d, d, d, y0, y1),
    ...wall(d, d, -d, d, y0, y1),
    ...wall(-d, d, -d, -d, y0, y1),
  ];
}

describe('findCrowdSpots', () => {
  const y = 0.45;
  // The step, with the step behind it rising at its back edge, and stairs going up through its north
  // side in half steps: one in front of the step, one at its back, and in between a stair step that
  // is level with the step itself.
  const steps = new Float32Array([
    ...ringFloor(y, 2.4, 3),
    ...ringWall(3, y, y + 0.4),
    ...floor(-0.3, -2.4, 0.3, -2.1, y - 0.2),
    ...floor(-0.3, -3, 0.3, -2.85, y + 0.2),
    ...wall(-0.3, -2.85, 0.3, -2.85, y, y + 0.2),
  ]);
  // A barrier along the front edge of the step, with a gap for the stairs.
  const barrier = new Float32Array([
    ...wall(-2.42, -2.42, -0.3, -2.42, y, y + 0.47),
    ...wall(0.3, -2.42, 2.42, -2.42, y, y + 0.47),
    ...wall(2.42, -2.42, 2.42, 2.42, y, y + 0.47),
    ...wall(2.42, 2.42, -2.42, 2.42, y, y + 0.47),
    ...wall(-2.42, 2.42, -2.42, -2.42, y, y + 0.47),
  ]);
  const options = { rowHeights: [y], radius: 0.14, height: 0.98, spacing: 0.42, clearance: 0.02 };
  const spots = findCrowdSpots(steps, [barrier], options);
  const need = options.radius + options.clearance;

  it('fills the step all the way round', () => {
    // About 4 sides of 5 m each, at 0.42 m apart, minus the stairs and the corners.
    expect(spots.length).toBeGreaterThan(35);
    expect(spots.length).toBeLessThan(52);
    for (const p of spots) {
      expect(p.y).toBe(y);
      expect(p.row).toBe(0);
    }
  });

  it('keeps everyone right behind the barrier, with room around them', () => {
    for (const p of spots) {
      const out = Math.max(Math.abs(p.x), Math.abs(p.z)); // distance from the middle, square
      expect(out).toBeGreaterThanOrEqual(2.42 + need - 0.03);
      // At the front of the step, not at its back (right beside the stairs a spot may sit further back).
      if (!(p.z < -2 && Math.abs(p.x) < 0.8)) expect(out).toBeLessThan(2.42 + need + 0.1);
      expect(3 - out).toBeGreaterThanOrEqual(need - 0.03); // clear of the step behind
    }
  });

  it('keeps the stairs free, also where a stair step is level with the row', () => {
    for (const p of spots) {
      if (p.z < -2) expect(Math.abs(p.x)).toBeGreaterThanOrEqual(0.3 + need - 0.03);
    }
  });

  it('never puts two people closer than the spacing', () => {
    for (const p of spots) {
      for (const q of spots) {
        if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(options.spacing - 1e-6);
      }
    }
  });

  it('says so when a row height has no step', () => {
    expect(() => findCrowdSpots(steps, [], { ...options, rowHeights: [1.2] })).toThrow(/No stand step/);
  });
});

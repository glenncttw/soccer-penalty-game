import { describe, expect, it } from 'vitest';
import { findCrowdSpots, shapeOf } from './crowdSpots';

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
  // A person: a body, arms sticking out sideways, and a head above the barrier's height.
  const body = { x0: -0.14, x1: 0.14, y0: 0, y1: 0.6, z0: -0.14, z1: 0.14 };
  const arms = { x0: -0.3, x1: 0.3, y0: 0.2, y1: 0.5, z0: -0.06, z1: 0.1 };
  const head = { x0: -0.2, x1: 0.2, y0: 0.5, y1: 0.98, z0: -0.2, z1: 0.2 };
  const options = {
    rowHeights: [y],
    looks: [
      {
        shapes: {
          cheer: [body, arms, head],
          move: [body, arms, head],
          calm: [body, arms, head],
        },
        share: 1,
      },
    ],
    cheerShare: 0,
    spacing: 0.7,
    spacingJitter: 0,
    depthJitter: 0,
    gaps: 0,
    clearance: 0.02,
    sizeVariation: 0,
    turn: 0,
    random: () => 0.5,
  };
  const spots = findCrowdSpots(steps, [barrier], options);
  const need = body.x1 + options.clearance;

  it('fills the step all the way round', () => {
    // About 4 sides of 5 m each, at 0.7 m apart, minus the stairs and the corners.
    expect(spots.length).toBeGreaterThan(20);
    expect(spots.length).toBeLessThan(31);
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

  it('keeps the stairs free, also where a stair step is level with the row, arms included', () => {
    for (const p of spots) {
      if (p.z < -2) expect(Math.abs(p.x)).toBeGreaterThanOrEqual(0.3 + arms.x1 + options.clearance - 0.03);
    }
  });

  it('turns everyone to face the pitch', () => {
    for (const p of spots) {
      const toMiddle = Math.hypot(p.x, p.z);
      const front = { x: Math.sin(p.angle), z: Math.cos(p.angle) };
      expect(-(front.x * p.x + front.z * p.z) / toMiddle).toBeGreaterThan(0.7);
    }
  });

  it('never puts two people closer than the spacing', () => {
    for (const p of spots) {
      for (const q of spots) {
        if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(options.spacing - 1e-6);
      }
    }
  });

  it('keeps people apart however they are spread, spaced and turned', () => {
    const random = mulberry(7);
    const loose = findCrowdSpots(steps, [barrier], {
      ...options,
      spacing: 0.6,
      spacingJitter: 0.4,
      depthJitter: 0.3,
      gaps: 0.2,
      turn: 0.5,
      random,
    });
    expect(loose.length).toBeGreaterThan(10);
    // Their arms (the widest part, 60 cm across) never cross, so their middles are at least that far apart side to side.
    for (const p of loose) {
      for (const q of loose) {
        if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(body.z1 * 2);
      }
    }
    // Not all at the same distance from the barrier.
    const outs = loose.map((p) => Math.max(Math.abs(p.x), Math.abs(p.z)));
    expect(Math.max(...outs) - Math.min(...outs)).toBeGreaterThan(0.03);
  });

  it('mixes the looks, with neighbours looking different and each look getting about its share', () => {
    const look = { shapes: options.looks[0].shapes, share: 1 };
    const mixed = findCrowdSpots(steps, [barrier], { ...options, looks: [look, look, look], random: mulberry(3) });
    expect(mixed.length).toBe(spots.length);
    for (let i = 1; i < mixed.length; i++) expect(mixed[i].look).not.toBe(mixed[i - 1].look);
    for (const l of [0, 1, 2]) {
      expect(mixed.filter((p) => p.look === l).length).toBeGreaterThanOrEqual(Math.floor(mixed.length / 3) - 2);
    }
  });

  it('gives a look with no room here to someone else, a wider one only where it fits', () => {
    const wide = [body, arms, { ...head, x0: -0.4, x1: 0.4 }];
    const mixed = findCrowdSpots(steps, [barrier], {
      ...options,
      looks: [options.looks[0], { shapes: { cheer: wide, move: wide, calm: wide }, share: 1 }],
    });
    expect(mixed.length).toBe(spots.length);
    // Two wide heads side by side would touch at this spacing, so they never stand next to each other.
    for (const p of mixed) {
      for (const q of mixed) {
        if (p !== q && p.look === 1 && q.look === 1) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(0.8);
      }
    }
    expect(mixed.some((p) => p.look === 1)).toBe(true);
  });

  it('says so when a row height has no step', () => {
    expect(() => findCrowdSpots(steps, [], { ...options, rowHeights: [1.2] })).toThrow(/No stand step/);
  });
});

describe('shapeOf', () => {
  it('measures a part layer by layer, so it is only as wide at each height as it really is', () => {
    // An upright triangle: a point at the bottom, 60 cm wide at the top, 20 cm high.
    const boxes = shapeOf(new Float32Array([0, 0, 0, -0.3, 0.2, 0, 0.3, 0.2, 0]), 0.1);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].y0).toBeCloseTo(0);
    expect(boxes[0].y1).toBeCloseTo(0.1);
    expect(boxes[0].x0).toBeCloseTo(-0.15);
    expect(boxes[0].x1).toBeCloseTo(0.15);
    expect(boxes[1].x0).toBeCloseTo(-0.3);
    expect(boxes[1].x1).toBeCloseTo(0.3);
  });
});

/** Seeded random numbers, so the test is the same every run. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { describe, expect, it } from 'vitest';
import { TILE_PIXELS, bladePieces, bladePoints, createBlades } from './grassTexture';

const blades = createBlades(3);

describe('createBlades', () => {
  it('makes the same blades from the same seed, and different ones from another seed', () => {
    expect(createBlades(3)).toEqual(blades);
    expect(createBlades(4)).not.toEqual(blades);
  });

  it('scatters short blades over the whole tile, each with a brightness', () => {
    for (const b of blades) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThan(1);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThan(1);
      expect(b.length).toBeGreaterThan(0);
      expect(b.length).toBeLessThan(0.1);
      expect(b.shade).toBeGreaterThan(0);
      expect(b.shade).toBeLessThanOrEqual(1);
    }
    // Every quarter of the tile gets its share.
    for (const [qx, qy] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const inQuarter = blades.filter((b) => Math.floor(b.x * 2) === qx && Math.floor(b.y * 2) === qy);
      expect(inQuarter.length / blades.length).toBeCloseTo(0.25, 1);
    }
  });
});

describe('bladePoints', () => {
  it('runs from the root to the tip, curling sideways by the bend', () => {
    const b = { x: 0.5, y: 0.5, angle: 0, length: 0.04, bend: 0.5, shade: 1 };
    const pts = bladePoints(b, 4);
    expect(pts[0]).toEqual([0.5, 0.5]);
    expect(pts[4][0]).toBeCloseTo(0.54);
    expect(pts[4][1]).toBeCloseTo(0.5);
    expect(pts[2][1]).toBeGreaterThan(0.5); // the middle is pushed to one side
    expect(bladePoints({ ...b, bend: 0 }, 4)[2][1]).toBeCloseTo(0.5);
  });
});

describe('bladePieces', () => {
  const pieces = bladePieces(blades);

  it('draws every root piece before any tip piece, getting thinner and brighter toward the tips', () => {
    const radii = pieces.map((p) => p.r0);
    expect(radii).toEqual([...radii].sort((a, b) => b - a));
    for (const p of pieces) {
      expect(p.r1).toBeLessThan(p.r0);
      expect(p.l1).toBeGreaterThan(p.l0);
    }
  });

  it('repeats pieces that cross an edge on the other side, so the tile wraps seamlessly', () => {
    // A blade poking out of the right edge also shows at the left edge, one tile over.
    const edge = { x: 0.99, y: 0.5, angle: 0, length: 0.04, bend: 0, shade: 1 };
    const copies = bladePieces([edge]).filter((p) => p.x1 > p.x0);
    const tip = copies.filter((p) => Math.max(p.x0, p.x1) > TILE_PIXELS);
    expect(tip.length).toBeGreaterThan(0);
    for (const p of tip) {
      expect(copies.some((c) => c.x0 === p.x0 - TILE_PIXELS && c.y0 === p.y0)).toBe(true);
    }
    // Pieces well inside the tile are drawn once.
    const middle = { ...edge, x: 0.5 };
    expect(bladePieces([middle])).toHaveLength(3);
  });
});

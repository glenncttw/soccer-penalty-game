import { describe, expect, it } from 'vitest';
import { CROWD_FLAG_SETTINGS } from './crowdFlagSettings';
import { flagMotions, flagShape, placeFlags } from './crowdFlags';
import type { CrowdSpot, PersonBox } from './crowdSpots';

/** Two triangles for an upright wall from (x0, z0) to (x1, z1), between heights y0 and y1. */
function wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): number[] {
  return [x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0];
}

// A person as one box: 0.6 m wide, 0.4 m deep, 1 m tall, the same in every way of moving.
const person: PersonBox[] = [{ x0: -0.3, x1: 0.3, y0: 0, y1: 1, z0: -0.2, z1: 0.2 }];
const shapes = [{ cheer: person, move: person, calm: person }];

/** A row of people along x at z = 0, facing +z (the pitch), 0.7 m apart. */
function row(count: number): CrowdSpot[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i - (count - 1) / 2) * 0.7,
    y: 0,
    z: 0,
    angle: 0,
    size: 1,
    moves: 'move' as const,
    row: 0,
    look: 0,
  }));
}

describe('crowd flags', () => {
  const s = { ...CROWD_FLAG_SETTINGS, places: [{ row: 0, along: 0.5 }] };

  it('takes up the room of the pole and the cloth at every swing', () => {
    const shape = flagShape(s);
    expect(Math.min(...shape.map((b) => b.y0))).toBeCloseTo(s.holdHeight - 0.05, 2); // the pole's hidden bottom
    expect(Math.max(...shape.map((b) => b.y1))).toBeGreaterThan(s.poleHeight); // swung up past its top
    expect(Math.max(...shape.map((b) => b.x1))).toBeGreaterThan(s.width * 0.95);
    expect(Math.max(...shape.map((b) => b.z1))).toBeCloseTo(s.ripple, 2); // the cloth's furthest ripple
  });

  it('raises and lifts all of the flag but the hidden bottom of its pole, which stays put', () => {
    const shape = flagShape(s, { raise: 0.2, swing: s.swing, lift: 0.1 });
    expect(Math.min(...shape.map((b) => b.y0))).toBeCloseTo(s.holdHeight - 0.05, 2);
    expect(Math.max(...shape.map((b) => b.y1))).toBeGreaterThan(s.poleHeight + 0.3);
  });

  it('gives each flag its own waving, within the settings', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const motions = flagMotions({ ...s, places: Array.from({ length: 20 }, () => ({ row: 0, along: 0 })) }, random);
    for (const m of motions) {
      expect(m.raise).toBeGreaterThanOrEqual(0);
      expect(m.raise).toBeLessThanOrEqual(s.raise);
      expect(m.swing).toBeGreaterThanOrEqual(s.swing * (1 - s.variety) - 1e-9);
      expect(m.swing).toBeLessThanOrEqual(s.swing);
      expect(m.lift).toBeGreaterThanOrEqual(s.lift * (1 - s.variety) - 1e-9);
    }
    expect(new Set(motions.map((m) => m.swing.toFixed(3))).size).toBeGreaterThan(10);
  });

  it('points every flag the same way, give or take its turn', () => {
    const flags = placeFlags(
      row(21),
      { stadium: new Float32Array(), shapes },
      { ...s, places: [0.1, 0.5, 0.9].map((along) => ({ row: 0, along })) },
      2,
    );
    expect(flags).toHaveLength(3);
    for (const f of flags) expect(Math.abs(f.angle - 2)).toBeLessThanOrEqual((s.turn * Math.PI) / 180 + 1e-9);
  });

  it('puts a flag behind the person nearest the place asked for, with nothing in the way', () => {
    const spots = row(9);
    const flags = placeFlags(spots, { stadium: new Float32Array(), shapes }, s, 0);
    expect(flags).toHaveLength(1);
    const f = flags[0];
    expect(Math.abs(spots[f.holder].x)).toBeLessThan(0.71); // the middle person, or next to them
    expect(f.z).toBeLessThan(-0.2); // behind them
  });

  it('finds no room where walls stand close behind each other right behind the people, up to over the cloth', () => {
    const stadium = new Float32Array([-0.3, -0.5, -0.7, -0.9].flatMap((z) => wall(-10, z, 10, z, 0, 4)));
    expect(placeFlags(row(9), { stadium, shapes }, s, 0)).toHaveLength(0);
  });

  it('keeps the cloth off the people of the row behind', () => {
    // A second row 0.5 m higher and 0.6 m back, so close the cloth would reach into their heads.
    const behind = row(9).map((p) => ({ ...p, y: 0.5, z: -0.6, row: 1 }));
    const tall: PersonBox[] = [{ x0: -0.3, x1: 0.3, y0: 0, y1: 2.5, z0: -0.2, z1: 0.2 }];
    const flags = placeFlags(
      [...row(9), ...behind],
      { stadium: new Float32Array(), shapes: [{ cheer: tall, move: tall, calm: tall }] },
      s,
      0,
    );
    expect(flags).toHaveLength(0);
  });
});

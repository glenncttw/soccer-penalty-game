import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Holding } from './crowd';
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
// Holding a pole up in front of a shoulder: the hand 0.2 m out to that side and 0.21 m in front; the arm up to it,
// and the person's head and body (narrower than all of their room, which takes in their arms).
const holding: Holding = {
  hand: { 1: new THREE.Vector3(0.2, 0.56, 0.21), [-1]: new THREE.Vector3(-0.2, 0.56, 0.21) },
  arm: {
    1: [{ x0: 0.1, x1: 0.25, y0: 0.4, y1: 0.6, z0: -0.05, z1: 0.25 }],
    [-1]: [{ x0: -0.25, x1: -0.1, y0: 0.4, y1: 0.6, z0: -0.05, z1: 0.25 }],
  },
  still: [[{ x0: -0.15, x1: 0.15, y0: 0, y1: 1, z0: -0.15, z1: 0.12 }]],
};

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
    const shape = flagShape(s, 0.5);
    expect(Math.min(...shape.map((b) => b.y0))).toBeCloseTo(0.5 - 0.01, 1); // the pole's bottom, in the hand
    expect(Math.max(...shape.map((b) => b.y1))).toBeGreaterThan(s.poleHeight); // swung up past its top
    expect(Math.max(...shape.map((b) => b.x1))).toBeGreaterThan(s.width * 0.95);
    expect(Math.max(...shape.map((b) => b.z1))).toBeCloseTo(s.ripple, 2); // the cloth's furthest ripple
  });

  it('lifts all of the flag with the hand, and raises its top', () => {
    const still = flagShape(s, 0.5, { raise: 0, swing: s.swing, lift: 0 });
    const shape = flagShape(s, 0.5, { raise: 0.2, swing: s.swing, lift: 0.1 });
    const lowest = (boxes: PersonBox[]) => Math.min(...boxes.map((b) => b.y0));
    expect(lowest(shape)).toBeCloseTo(lowest(still), 5); // from where it's held at its lowest
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

  it('sends the cloth along the row to the side it is held on, the flags taking turns which side, each turned a little', () => {
    const flags = placeFlags(row(21), { stadium: new Float32Array(), shapes }, holding, {
      ...s,
      places: [0.1, 0.5, 0.9].map((along) => ({ row: 0, along })),
    });
    expect(flags).toHaveLength(3);
    const turn = (s.turn * Math.PI) / 180 + 1e-9;
    flags.forEach((f, n) => {
      // Nothing in the way here, so each gets the side it tries first.
      expect(f.side).toBe(n % 2 === 0 ? 1 : -1);
      expect(Math.abs(f.angle - (n % 2 === 0 ? 0 : Math.PI))).toBeLessThanOrEqual(turn);
    });
  });

  it('puts the pole in the hand of the person nearest the place asked for', () => {
    const spots = row(9);
    const flags = placeFlags(spots, { stadium: new Float32Array(), shapes }, holding, s);
    expect(flags).toHaveLength(1);
    const f = flags[0];
    const bearer = spots[f.holder];
    expect(Math.abs(bearer.x)).toBeLessThan(0.71); // the middle person, or next to them
    expect(f.x).toBeCloseTo(bearer.x + 0.2 * f.side, 5);
    expect(f.z).toBeCloseTo(0.21, 5);
    expect(f.hold).toBeCloseTo(0.56, 5);
  });

  it('keeps the raised arm of the bearer out of the stadium', () => {
    // A wall just in front of the pole, so only the arm reaching past it would touch.
    const stadium = new Float32Array(wall(-10, 0.245, 10, 0.245, 0, 0.55));
    expect(placeFlags(row(9), { stadium, shapes }, holding, s)).toHaveLength(0);
  });

  it('never puts the pole through the head or body of the bearer', () => {
    const big = { ...holding, still: [[{ x0: -0.3, x1: 0.3, y0: 0, y1: 1, z0: -0.15, z1: 0.25 }]] };
    expect(placeFlags(row(9), { stadium: new Float32Array(), shapes }, big, s)).toHaveLength(0);
  });

  it('finds no room where a wall stands right in front of the people, up to over the cloth', () => {
    const stadium = new Float32Array(wall(-10, 0.3, 10, 0.3, 0, 4));
    expect(placeFlags(row(9), { stadium, shapes }, holding, s)).toHaveLength(0);
  });

  it('keeps the cloth off the people around', () => {
    // A row of tall people just in front, whom only the cloth's ripples would reach.
    const front = row(9).map((p) => ({ ...p, z: 0.5, row: 1 }));
    const tall: PersonBox[] = [{ x0: -0.3, x1: 0.3, y0: 0, y1: 2.5, z0: -0.2, z1: 0.2 }];
    const room = { stadium: new Float32Array(), shapes: [{ cheer: tall, move: tall, calm: tall }] };
    expect(placeFlags([...row(9), ...front], room, holding, s)).toHaveLength(0);
    expect(placeFlags(row(9), room, holding, s)).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import type { ColliderMesh } from '../worldConfig';
import { BoardsBoundary } from './boundary';

/** A board as a flat box from (x0, z0) to (x1, z1), 0.72 m high (only the corners matter here). */
function board(x0: number, z0: number, x1: number, z1: number): ColliderMesh {
  const vertices: number[] = [];
  for (const y of [0, 0.72]) vertices.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array() };
}

// Like the stadium: boards behind the goal at z = -5.6 and down both touchlines to z = 8.7.
const ring = new BoardsBoundary([
  board(-6.4, -5.76, 6.4, -5.44),
  board(-6.4, -5.6, -6.08, 8.7),
  board(6.08, -5.6, 6.4, 8.7),
]);

describe('BoardsBoundary', () => {
  it('keeps the ball in play on the pitch and in the goal', () => {
    expect(ring.isBeyond({ x: 0, y: 0.175, z: 12.4 })).toBe(false); // on the spot, in front of the boards' ends
    expect(ring.isBeyond({ x: 0, y: 1, z: -2 })).toBe(false); // in the net
    expect(ring.isBeyond({ x: 5.9, y: 0.5, z: 3 })).toBe(false); // against a side board
  });

  it('notices a ball that flew over the side or back boards', () => {
    expect(ring.isBeyond({ x: 6.6, y: 0.9, z: 3 })).toBe(true);
    expect(ring.isBeyond({ x: -6.6, y: 0.9, z: -1 })).toBe(true);
    expect(ring.isBeyond({ x: 1, y: 1.5, z: -6 })).toBe(true);
  });

  it('does nothing without boards', () => {
    expect(new BoardsBoundary([]).isBeyond({ x: 50, y: 1, z: -50 })).toBe(false);
  });
});

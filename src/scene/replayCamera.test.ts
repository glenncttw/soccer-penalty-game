import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../physics/ballForces';
import { keepFacingGoal, MAX_LOOK_DOWN, MAX_LOOK_UP, MAX_TURN, REPLAY_ANGLES, replayCameraPose } from './replayCamera';

const SPOT = { x: 0, y: 0.175, z: 12.4 };

/** Straight-line shots from the spot to points all over the goal mouth, sampled along the way. */
function shots() {
  const out: { path: Vec3[]; end: Vec3 }[] = [];
  for (const x of [-2.6, -1.5, 0, 1.5, 2.6]) {
    for (const y of [0.2, 1, 1.85]) {
      const end = { x, y, z: 0.1 };
      const path = Array.from({ length: 11 }, (_, i) => {
        const k = i / 10;
        return { x: SPOT.x + (x - SPOT.x) * k, y: SPOT.y + (y - SPOT.y) * k, z: SPOT.z + (end.z - SPOT.z) * k };
      });
      out.push({ path, end });
    }
  }
  return out;
}

function angles(from: Vec3, at: Vec3) {
  const d = { x: at.x - from.x, y: at.y - from.y, z: at.z - from.z };
  return { turn: Math.atan2(d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}

describe('replayCameraPose', () => {
  it('always stands in front of the goal, near the game camera at most, and looks toward the goal', () => {
    for (const angle of REPLAY_ANGLES) {
      for (const { path, end } of shots()) {
        path.forEach((ball, i) => {
          const side = end.x >= 0 ? 1 : -1;
          const pose = replayCameraPose(angle, ball, { lineZ: 0, groundY: 0, end, side }, i / 10);
          const p = pose.position;
          expect(p.z).toBeGreaterThan(3);
          expect(p.z).toBeLessThan(18); // never far behind the game's own camera (15.8 m from the goal)
          expect(Math.abs(p.x)).toBeLessThan(3);
          expect(p.y).toBeGreaterThan(0.3);
          expect(p.y).toBeLessThan(4);
          const a = angles(p, pose.target);
          expect(Math.abs(a.turn)).toBeLessThanOrEqual(MAX_TURN + 1e-9);
          expect(a.pitch).toBeLessThanOrEqual(MAX_LOOK_UP + 1e-9);
          expect(a.pitch).toBeGreaterThanOrEqual(-MAX_LOOK_DOWN - 1e-9);
        });
      }
    }
  });

  it('keeps the ball in the picture, even in the square picture on an upright phone', () => {
    for (const angle of REPLAY_ANGLES) {
      for (const { path, end } of shots()) {
        path.forEach((ball, i) => {
          const side = end.x >= 0 ? 1 : -1;
          const pose = replayCameraPose(angle, ball, { lineZ: 0, groundY: 0, end, side }, i / 10);
          const view = angles(pose.position, pose.target);
          const toBall = angles(pose.position, ball);
          const half = ((pose.fov / 2) * Math.PI) / 180;
          expect(Math.abs(toBall.turn - view.turn)).toBeLessThan(half);
          expect(Math.abs(toBall.pitch - view.pitch)).toBeLessThan(half);
        });
      }
    }
  });
});

describe('keepFacingGoal', () => {
  it('turns a look to the side, up or backward back toward the goal', () => {
    const from = { x: 0, y: 1, z: 5 };
    const side = angles(from, keepFacingGoal(from, { x: 10, y: 1, z: 4 }));
    expect(side.turn).toBeCloseTo(MAX_TURN);
    const up = angles(from, keepFacingGoal(from, { x: 0, y: 8, z: 0 }));
    expect(up.pitch).toBeCloseTo(MAX_LOOK_UP);
    const back = keepFacingGoal(from, { x: 1, y: 1, z: 9 });
    expect(back.z).toBeLessThan(from.z);
  });

  it('leaves a look at the goal alone', () => {
    const from = { x: 1, y: 0.4, z: 5 };
    const at = { x: 0.5, y: 0.9, z: -0.3 };
    const kept = keepFacingGoal(from, at);
    expect(kept.x).toBeCloseTo(at.x);
    expect(kept.y).toBeCloseTo(at.y);
    expect(kept.z).toBeCloseTo(at.z);
  });
});

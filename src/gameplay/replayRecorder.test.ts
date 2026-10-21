import { describe, expect, it } from 'vitest';
import type { KeeperPose } from '../physics/keeperBody';
import { blankFrame, ReplayRecorder, replayWindow } from './replayRecorder';

const SETTINGS = { duration: 2.5, slowest: 0.3, fastest: 0.7, afterResult: 0.45, afterImpact: 0.3 };

function pose(x: number): KeeperPose {
  return { pivot: { x, y: 0, z: 0 }, tilt: x, gloves: [{ x: -0.4, y: 1, z: 0 }, { x: 0.4, y: 1, z: 0 }], crouch: 0 };
}

describe('ReplayRecorder', () => {
  it('blends between the two nearest frames', () => {
    const r = new ReplayRecorder();
    r.start(10);
    r.record(10, { x: 0, y: 0, z: 12 }, { x: 0, y: 0, z: 0, w: 1 }, 1, pose(0));
    r.record(10.5, { x: 2, y: 1, z: 2 }, { x: 0, y: 0, z: 0, w: 1 }, 0, pose(1));
    const f = r.sample(10.25, blankFrame());
    expect(f.ball).toEqual({ x: 1, y: 0.5, z: 7 });
    expect(f.ballOpacity).toBeCloseTo(0.5);
    expect(f.keeper.pivot.x).toBeCloseTo(0.5);
    expect(f.keeper.tilt).toBeCloseTo(0.5);
  });

  it('holds the first and last frames outside the recording', () => {
    const r = new ReplayRecorder();
    r.start(0);
    r.record(0, { x: 0, y: 0, z: 12 }, { x: 0, y: 0, z: 0, w: 1 }, 1, pose(0));
    r.record(1, { x: 3, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 1, pose(0));
    expect(r.sample(-1, blankFrame()).ball.x).toBe(0);
    expect(r.sample(5, blankFrame()).ball.x).toBe(3);
  });

  it('keeps its own copies, so later changes to the live pose do not leak in', () => {
    const r = new ReplayRecorder();
    const live = pose(0);
    r.start(0);
    r.record(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 1, live);
    live.pivot.x = 5;
    live.gloves[0].y = 9;
    expect(r.frames[0].keeper.pivot.x).toBe(0);
    expect(r.frames[0].keeper.gloves[0].y).toBe(1);
  });

  it('turns the ball the short way round between frames', () => {
    const r = new ReplayRecorder();
    const half = Math.SQRT1_2;
    r.start(0);
    r.record(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 1, pose(0));
    r.record(1, { x: 0, y: 0, z: 0 }, { x: 0, y: -half, z: 0, w: -half }, 1, pose(0)); // +90° about y, sign flipped
    const q = r.sample(0.5, blankFrame()).spin;
    expect(Math.abs(q.w)).toBeCloseTo(Math.cos(Math.PI / 8)); // 45°, not the long way round
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
  });
});

describe('ReplayRecorder impacts', () => {
  it('finds the first time the ball hit something, from a given moment', () => {
    const r = new ReplayRecorder();
    r.start(0);
    r.markImpact(0.7); // the post
    r.markImpact(1.1); // the net
    expect(r.impactAfter(0)).toBe(0.7);
    expect(r.impactAfter(0.9)).toBe(1.1);
    expect(r.impactAfter(2)).toBeNull();
    r.start(5);
    expect(r.impactAfter(0)).toBeNull();
  });
});

describe('replayWindow', () => {
  it('slows a quick shot down to fill the replay', () => {
    const w = replayWindow(0, 0.6, 2, SETTINGS);
    expect(w.start).toBe(0);
    expect(w.end).toBeCloseTo(1.05);
    expect(w.rate).toBeCloseTo(1.05 / 2.5);
    expect(w.length).toBeCloseTo(2.5);
  });

  it('only shows the end of a slow shot', () => {
    const w = replayWindow(0, 3, 4, SETTINGS);
    expect(w.end).toBeCloseTo(3.45);
    expect(w.start).toBeCloseTo(3.45 - 2.5 * 0.7);
    expect(w.rate).toBeCloseTo(0.7);
    expect(w.length).toBeCloseTo(2.5);
  });

  it('stops just after the ball hits something, before it rolls away', () => {
    const w = replayWindow(0, 2.5, 4, SETTINGS, 0.8);
    expect(w.end).toBeCloseTo(1.1);
    expect(w.start).toBe(0);
  });

  it('never goes slower than the slowest speed, so a very short shot gets a shorter replay', () => {
    const w = replayWindow(0, 0.2, 0.4, SETTINGS);
    expect(w.rate).toBe(0.3);
    expect(w.length).toBeCloseTo(0.4 / 0.3);
  });
});

import { describe, expect, it } from 'vitest';
import type { GoalConfig } from '../worldConfig';
import { OutcomeTracker } from './outcome';

// The stadium goal as measured from the Blender model.
const goal: GoalConfig = {
  lineZ: 0,
  innerHalfWidth: 2.82,
  crossbarY: 1.92,
  outerHalfWidth: 3,
  outerHeight: 2.1,
  postThickness: 0.18,
  postDepth: 0.18,
  netHalfWidth: 2.885,
  netRoofY: 1.975,
  netRoofBackZ: -1.06,
  netBackZ: -2.6,
};
const R = 0.175;
const tracker = () => new OutcomeTracker(goal, R);

describe('OutcomeTracker', () => {
  it('counts a ball fully over the line inside the frame as a goal', () => {
    const t = tracker();
    expect(t.update({ x: 1, y: 1, z: 2 }, 20, 0.1)).toBeNull();
    expect(t.update({ x: 1, y: 1, z: -0.3 }, 20, 0.1)).toBe('goal');
  });

  it('does not count a ball still on the line', () => {
    const t = tracker();
    expect(t.update({ x: 0, y: 1, z: -0.2 }, 20, 0.01)).toBeNull();
  });

  it('counts corner shots just inside the posts and under the bar', () => {
    const t = tracker();
    expect(t.update({ x: 2.7, y: 1.8, z: -0.4 }, 20, 0.1)).toBe('goal');
  });

  it('counts a ball past the post as a miss', () => {
    const t = tracker();
    expect(t.update({ x: 3.4, y: 1, z: -0.4 }, 20, 0.1)).toBe('miss');
  });

  it('counts a ball over the crossbar as a miss', () => {
    const t = tracker();
    expect(t.update({ x: 0, y: 2.3, z: -0.4 }, 20, 0.1)).toBe('miss');
  });

  it('notices the ball touching the crossbar', () => {
    const t = tracker();
    t.update({ x: 0, y: 2.0, z: 0.1 }, 20, 0.01);
    expect(t.hitFrame).toBe(true);
  });

  it('notices the ball touching a post', () => {
    const t = tracker();
    t.update({ x: 2.7, y: 1, z: 0.05 }, 20, 0.01);
    expect(t.hitFrame).toBe(true);
  });

  it('ends the shot when the ball flies into the stands', () => {
    const t = tracker();
    t.wentOut();
    expect(t.update({ x: 6.6, y: 1, z: 3 }, 20, 0.01)).toBe('miss');
    const tipped = tracker();
    tipped.keeperTouched(0.6);
    tipped.wentOut();
    expect(tipped.result).toBe('saved');
  });

  it('keeps a goal a goal when the ball later flies out', () => {
    const t = tracker();
    t.update({ x: 0, y: 1, z: -0.4 }, 20, 0.01);
    t.wentOut();
    expect(t.result).toBe('goal');
  });

  it('gives up when the ball stops short', () => {
    const t = tracker();
    t.update({ x: 0, y: R, z: 6 }, 5, 0.6);
    expect(t.update({ x: 0, y: R, z: 6 }, 0.1, 0.1)).toBe('miss');
  });

  it('counts a shot the keeper pushes back out as a save', () => {
    const t = tracker();
    t.keeperTouched(0.6);
    expect(t.update({ x: 0.5, y: 1, z: 0.8 }, 9, 0.01)).toBeNull();
    expect(t.update({ x: 0.5, y: 1, z: 1.1 }, 9, 0.01)).toBe('saved');
  });

  it('counts a shot the keeper pushes wide as a save', () => {
    const t = tracker();
    t.keeperTouched(0.6);
    expect(t.update({ x: 3.7, y: 1, z: 0.5 }, 9, 0.01)).toBe('saved');
  });

  it('still counts a goal when the ball gets past the keeper', () => {
    const t = tracker();
    t.keeperTouched(0.6);
    expect(t.update({ x: 2.4, y: 1, z: -0.4 }, 15, 0.01)).toBe('goal');
    expect(t.hitKeeper).toBe(true);
  });

  it('ignores the keeper once the shot is decided', () => {
    const t = tracker();
    t.update({ x: 3.4, y: 1, z: -0.4 }, 20, 0.1);
    t.keeperTouched(0.6);
    expect(t.result).toBe('miss');
    expect(t.hitKeeper).toBe(false);
  });
});

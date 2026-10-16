import { describe, expect, it } from 'vitest';
import type { GoalConfig } from '../worldConfig';
import { clampAimToGoal } from './aim';

const goal = { innerHalfWidth: 2.82, crossbarY: 1.92 } as GoalConfig;
const r = 0.175;

describe('clampAimToGoal', () => {
  it('leaves an aim inside the goal alone', () => {
    const aim = { x: -1.2, y: 0.8, z: 0 };
    clampAimToGoal(aim, goal, 0, r);
    expect(aim).toEqual({ x: -1.2, y: 0.8, z: 0 });
  });

  it('pulls an aim beside a post back inside it', () => {
    const left = { x: -4, y: 1, z: 0 };
    const right = { x: 3.3, y: 1, z: 0 };
    clampAimToGoal(left, goal, 0, r);
    clampAimToGoal(right, goal, 0, r);
    expect(left.x).toBeCloseTo(-2.82 + r);
    expect(right.x).toBeCloseTo(2.82 - r);
  });

  it('keeps the ball under the bar and on the grass', () => {
    const high = { x: 0, y: 3, z: 0 };
    const low = { x: 0, y: -0.5, z: 0 };
    clampAimToGoal(high, goal, 0, r);
    clampAimToGoal(low, goal, 0, r);
    expect(high.y).toBeCloseTo(1.92 - r);
    expect(low.y).toBeCloseTo(r);
  });
});

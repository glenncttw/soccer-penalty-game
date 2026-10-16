import { describe, expect, it } from 'vitest';
import { OutcomeTracker } from './outcome';

describe('OutcomeTracker', () => {
  it('counts a ball fully over the line inside the frame as a goal', () => {
    const t = new OutcomeTracker();
    expect(t.update({ x: 1, y: 1, z: 2 }, 20, 0.1)).toBeNull();
    expect(t.update({ x: 1, y: 1, z: -0.2 }, 20, 0.1)).toBe('goal');
  });

  it('counts a ball past the post as a miss', () => {
    const t = new OutcomeTracker();
    expect(t.update({ x: 4.5, y: 1, z: -0.2 }, 20, 0.1)).toBe('miss');
  });

  it('notices the ball touching the crossbar', () => {
    const t = new OutcomeTracker();
    t.update({ x: 0, y: 2.45, z: 0.05 }, 20, 0.01);
    expect(t.hitFrame).toBe(true);
  });

  it('gives up when the ball stops short', () => {
    const t = new OutcomeTracker();
    t.update({ x: 0, y: 0.11, z: 6 }, 5, 0.6);
    expect(t.update({ x: 0, y: 0.11, z: 6 }, 0.1, 0.1)).toBe('miss');
  });
});

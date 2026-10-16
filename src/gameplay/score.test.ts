import { describe, expect, it } from 'vitest';
import { Score } from './score';

describe('Score', () => {
  it('counts goals, shots and goals in a row', () => {
    const score = new Score();
    for (const goal of [true, true, false, true]) score.record(goal);
    expect({ goals: score.goals, shots: score.shots, streak: score.streak }).toEqual({ goals: 3, shots: 4, streak: 1 });
  });
});

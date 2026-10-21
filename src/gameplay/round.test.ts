import { describe, expect, it } from 'vitest';
import { Round } from './round';

describe('Round', () => {
  it('counts only real goals and ends after the last penalty', () => {
    const round = new Round(5);
    for (const r of ['goal', 'saved', 'goal', 'miss'] as const) round.record(r);
    expect(round.goals).toBe(2);
    expect(round.over).toBe(false);
    round.record('goal');
    expect(round.over).toBe(true);
    expect(round.goals).toBe(3);
  });

  it('ignores shots after the round is over, and starts again from nothing', () => {
    const round = new Round(2);
    round.record('goal');
    round.record('goal');
    round.record('goal');
    expect(round.results).toHaveLength(2);
    round.reset();
    expect(round.results).toHaveLength(0);
    expect(round.over).toBe(false);
  });
});

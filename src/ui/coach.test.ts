import { describe, expect, it } from 'vitest';
import { Coach } from './coach';

describe('Coach', () => {
  it('shows each tip when it is needed', () => {
    const coach = new Coach(false);
    expect(coach.update('aiming', 0)).toBe('aim');
    expect(coach.update('charging', 0)).toBe('curl');
    expect(coach.update('charging', 0.6)).toBe('release');
    expect(coach.update('charging', 0)).toBe('release'); // stays once the player has curled
    expect(coach.update('flight', 0)).toBeNull();
  });

  it('stops after the first curled shot', () => {
    const coach = new Coach(false);
    coach.update('charging', -0.8);
    coach.shotTaken();
    expect(coach.update('aiming', 0)).toBeNull();
  });

  it('stops after three shots even without curl', () => {
    const coach = new Coach(false);
    coach.shotTaken();
    coach.shotTaken();
    expect(coach.update('aiming', 0)).toBe('aim');
    coach.shotTaken();
    expect(coach.update('aiming', 0)).toBeNull();
  });

  it('stays quiet for players who have already finished it', () => {
    expect(new Coach(true).update('aiming', 0)).toBeNull();
  });
});

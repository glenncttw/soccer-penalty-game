/**
 * The slow-motion replay after a big moment: two comic-style panels, each from its own
 * camera, between two quick wipes. While the screen is covered, the ball and the keeper
 * go back to their spots, so the keeper never has to walk back up to the middle.
 */
export interface ReplaySettings {
  /** Which shots get a replay. Any other shot just gets a quick wipe. */
  moments: { goal: boolean; save: boolean; woodwork: boolean };
  /** Seconds the replay lasts (a tap skips it). */
  duration: number;
  /** Slowest and fastest replay speed (1 = real speed). Short shots play slower, long shots faster. */
  slowest: number;
  fastest: number;
  /** Game seconds the replay keeps going after the goal, save or miss was decided. */
  afterResult: number;
  /** Seconds the result banner shows before the wipe, after a shot with a replay and after one without. */
  holdWithReplay: number;
  holdWithout: number;
  /** Seconds the wipe takes to slide over the screen (and again to slide off). */
  wipeTime: number;
  /** Seconds the wipe rests over the screen in between, while the ball and keeper are put back. */
  wipeHold: number;
  /** Share of the screen's sharpness the panels are drawn at (lower is faster on phones). */
  resolution: number;
}

export const REPLAY_SETTINGS: ReplaySettings = {
  moments: { goal: true, save: true, woodwork: true },
  duration: 2.5,
  slowest: 0.3,
  fastest: 0.7,
  afterResult: 0.45,
  holdWithReplay: 1.2,
  holdWithout: 1.4,
  wipeTime: 0.4,
  wipeHold: 0.08,
  resolution: 0.75,
};

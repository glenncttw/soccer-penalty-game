/**
 * The slow-motion replay after a big moment: one comic-style panel from a low camera beside
 * the goal, between two quick wipes. While the screen is covered, the ball and the keeper
 * go back to their spots, so the keeper never has to walk back up to the middle.
 */
export interface ReplaySettings {
  /** Which shots get a replay. Any other shot just gets a quick wipe. */
  moments: { goal: boolean; save: boolean; woodwork: boolean };
  /** Seconds the replay lasts. */
  duration: number;
  /** Slowest and fastest replay speed (1 = real speed). Short shots play slower, long shots faster. */
  slowest: number;
  fastest: number;
  /** Game seconds the replay keeps going after the goal, save or miss was decided. */
  afterResult: number;
  /** Seconds the result banner shows before the wipe, after a shot with a replay and after one without. */
  holdWithReplay: number;
  holdWithout: number;
  /** Seconds the wipe takes to sweep across the screen, in one movement. */
  wipeTime: number;
  /** Share of the screen's sharpness the panel is drawn at (lower is faster on phones). */
  resolution: number;
}

export const REPLAY_SETTINGS: ReplaySettings = {
  moments: { goal: true, save: true, woodwork: true },
  duration: 3.5,
  slowest: 0.2,
  fastest: 0.7,
  afterResult: 0.45,
  holdWithReplay: 1.2,
  holdWithout: 1.4,
  wipeTime: 0.8,
  resolution: 0.75,
};

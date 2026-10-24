/**
 * The slow-motion replay after a big moment: one comic-style panel from a low camera beside
 * the goal, popping in over the purple tunnel, which closes in over the field as a circle before it and opens up
 * again after it. While the screen is all purple, the ball and the keeper
 * go back to their spots, so the keeper never has to walk back up to the middle.
 */
export interface ReplaySettings {
  /** Which shots get a replay. Any other shot just gets the circle closing and opening. */
  moments: { goal: boolean; save: boolean; woodwork: boolean };
  /** Seconds the replay lasts. */
  duration: number;
  /** Slowest and fastest replay speed (1 = real speed). Short shots play slower, long shots faster. */
  slowest: number;
  fastest: number;
  /** Game seconds the replay keeps going after the goal, save or miss was decided. */
  afterResult: number;
  /** Game seconds it keeps going after the ball first hits the keeper, the frame or the net. */
  afterImpact: number;
  /** Extra seconds a goal's replay keeps going at the end (the ball slowly settling in the net), so you see the crowd celebrate. */
  goalCheer: number;
  /**
   * Seconds the result words show before the circle closes, after a shot with a replay and after one without (longer
   * words, whose letters take longer than 0.45 s to pop up, stay up that much longer).
   */
  holdWithReplay: number;
  holdWithout: number;
  /** Seconds the purple circle takes to close in over the field, and to open up again. */
  closeTime: number;
  openTime: number;
  /** Share of the screen's sharpness the panel is drawn at (lower is faster on phones). */
  resolution: number;
  /** The panel's size, as a share of the biggest that fits under the "REPLAY" label (1 = biggest). */
  panelSize: number;
  /** How fast the purple tunnel's rings behind the panel come toward you, in times the landing's pace. */
  tunnelSpeed: number;
}

export const REPLAY_SETTINGS: ReplaySettings = {
  moments: { goal: true, save: true, woodwork: true },
  duration: 3.5,
  slowest: 0.2,
  fastest: 0.7,
  afterResult: 0.45,
  afterImpact: 0.3,
  goalCheer: 1,
  holdWithReplay: 1.2,
  holdWithout: 1.4,
  closeTime: 0.45,
  openTime: 0.55,
  resolution: 0.75,
  panelSize: 0.8,
  tunnelSpeed: 1,
};

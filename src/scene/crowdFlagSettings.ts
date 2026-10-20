/**
 * Big flags waving in the crowd. Each flag is held by someone in the stands: its pole stands just
 * behind them, so its bottom is hidden by the people, and its cloth waves above their heads.
 * Sizes are in metres (the crowd's people are about 0.9 m tall); colours are CSS hex strings.
 */
export interface CrowdFlagSettings {
  /** Show the flags. */
  flags: boolean;
  /**
   * Where the flags are: the row (0 = the lowest step in the crowd's `rowHeights`) and how far
   * along it, from its end on the left side near the camera (0), round behind the goal (0.5), to
   * its end on the right side (1). A flag goes to the nearest person there with room round them
   * for the flag while it waves, so it never touches the stadium or anyone.
   */
  places: { row: number; along: number }[];
  /** The cloth's width (from the pole out), in metres. */
  width: number;
  /** The cloth's height, in metres. */
  height: number;
  /** How high the pole's top is, above the step the person holding it stands on. */
  poleHeight: number;
  /**
   * How high the flag is held: it swings about this point, above the step. The pole starts just
   * below it, behind the head of the person holding it, so its bottom is hidden by them (and clears
   * the barrier behind them).
   */
  holdHeight: number;
  /** How far the flag swings to each side, in degrees. */
  swing: number;
  /** Swings per second. */
  swingSpeed: number;
  /** How far the cloth ripples at its free end, either way, in metres. */
  ripple: number;
  /** Ripples running along the cloth per second. */
  rippleSpeed: number;
  /** How far the cloth's free end sags below its edge at the pole, in metres. */
  sag: number;
  /** Cloth colours, one per flag in turn. */
  colors: string[];
  /** The pole's colour. */
  poleColor: string;
  /** Any whole number. The same seed always gives the same flags' timing. */
  seed: number;
}

export const CROWD_FLAG_SETTINGS: CrowdFlagSettings = {
  flags: true,
  places: [
    { row: 1, along: 0.22 },
    { row: 3, along: 0.33 },
    { row: 4, along: 0.38 },
    { row: 2, along: 0.43 },
    { row: 4, along: 0.5 },
    { row: 1, along: 0.6 },
    { row: 3, along: 0.66 },
    { row: 1, along: 0.76 },
  ],
  width: 1.6,
  height: 1,
  poleHeight: 2.95,
  holdHeight: 0.95,
  swing: 12,
  swingSpeed: 0.55,
  ripple: 0.1,
  rippleSpeed: 1.2,
  sag: 0.15,
  colors: ['#e63946', '#3a2f9e', '#ffffff', '#3a2f9e', '#e63946', '#3a2f9e', '#ffffff', '#e63946'],
  poleColor: '#e8e8e8',
  seed: 7,
};

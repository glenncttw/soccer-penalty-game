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
  /** How far each flag may be turned from pointing straight along its row (about the up axis), either way, in degrees. */
  turn: number;
  /** How much higher than `holdHeight` a flag may be held, in metres (each flag its own amount, up to this). */
  raise: number;
  /** How far a flag swings to each side, in degrees (each flag its own amount: see `variety`). */
  swing: number;
  /** Swings per second. */
  swingSpeed: number;
  /** How far a flag is lifted and let down again as it's waved, in metres (each flag its own amount: see `variety`). */
  lift: number;
  /** Lifts per second. */
  liftSpeed: number;
  /** 0..1: how much less than `swing` and `lift` a flag may swing and be lifted (0.5: between half and all of it). */
  variety: number;
  /** 0..1: how much faster or slower than the others a flag may wave (0.2: from 80% to 120% of the speeds). */
  speedVariety: number;
  /** How far the cloth ripples at its free end, either way, in metres. */
  ripple: number;
  /** Ripples running along the cloth per second. */
  rippleSpeed: number;
  /** How far the cloth's free end sags below its edge at the pole, in metres. */
  sag: number;
  /** Cloth colours, one per flag in turn. */
  colors: string[];
  /**
   * How big the logo (`public/assets/crowd/flag_logo.svg`) is, as a share of the cloth's height (less if it would be
   * too wide for the cloth), in the middle of the cloth. 0 = no logo.
   */
  logoSize: number;
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
  turn: 8,
  raise: 0.2,
  swing: 12,
  swingSpeed: 0.55,
  lift: 0.1,
  liftSpeed: 0.4,
  variety: 0.5,
  speedVariety: 0.2,
  ripple: 0.1,
  rippleSpeed: 1.2,
  sag: 0.15,
  colors: ['#fa3946', '#2269db', '#402985'],
  logoSize: 0.72,
  poleColor: '#e8e8e8',
  seed: 7,
};

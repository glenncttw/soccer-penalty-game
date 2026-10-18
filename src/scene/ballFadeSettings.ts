/** How the ball disappears in halftone dots after flying over the boards. Tweak it live in the settings editor (?edit). */
export interface BallFadeSettings {
  /** Distance between the dots, in screen pixels (at normal zoom). */
  dotSize: number;
  /** At least this many dots across the ball: a ball far away gets a finer grid, down to 3 pixels. */
  dotsAcross: number;
  /** Seconds from a whole ball to nothing. */
  duration: number;
}

export const BALL_FADE_SETTINGS: BallFadeSettings = {
  dotSize: 11,
  dotsAcross: 6,
  duration: 0.35,
};

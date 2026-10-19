/**
 * The soft focus: the picture stays sharp round the goal and the ball and gets softer toward the
 * edges of the screen (the stands, the sky, the sides), like a camera focused on the goal.
 * Sizes are shares of the screen's height, so it looks the same at every sharpness and on phones.
 */
export interface FocusSettings {
  /** Soften the edges. */
  softFocus: boolean;
  /** How soft the softest parts get: the blur's reach, as a share of the screen's height. */
  blur: number;
  /** 0..1: how much of that blur the edges get (0 = all sharp). */
  strength: number;
  /** How far the sharp area reaches past the goal and the ball, as a share of the screen's height. */
  margin: number;
  /** How rounded the sharp area's corners are, as a share of the screen's height. */
  roundness: number;
  /** How long the fade from sharp to soft is, as a share of the screen's height. */
  softness: number;
  /** 0..1: how soft it gets above the sharp area (stands, sky). */
  top: number;
  /** 0..1: how soft it gets left and right of the sharp area (the side stands). */
  sides: number;
  /** 0..1: how soft it gets below the sharp area (the grass in front of the ball). */
  bottom: number;
}

export const FOCUS_SETTINGS: FocusSettings = {
  softFocus: true,
  blur: 0.006,
  strength: 1,
  margin: 0.04,
  roundness: 0.12,
  softness: 0.25,
  top: 1,
  sides: 1,
  bottom: 0.3,
};

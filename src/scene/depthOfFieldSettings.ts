/**
 * The depth of field: like a camera focused on the goal, everything up to just behind the goal
 * stays sharp, and things further away (the stands behind it, the trees, the sky) get softer the
 * further away they are, with round, soft blur like a real lens. Blur sizes are shares of the
 * screen's height, so it looks the same at every sharpness and on phones.
 */
export interface DepthOfFieldSettings {
  /** Soften the far away parts. */
  depthOfField: boolean;
  /** How far behind the goal line things start to get soft, in metres (the net reaches about 2 m back). */
  sharpBehindGoal: number;
  /** How many metres further they take to get as soft as they get. */
  fadeDistance: number;
  /** How soft the softest parts get: the blur's width, as a share of the screen's height. */
  blur: number;
  /** 0..1: how much bright spots (the floodlights) light up their blur, like a real lens. */
  highlights: number;
}

export const DEPTH_OF_FIELD_SETTINGS: DepthOfFieldSettings = {
  depthOfField: true,
  sharpBehindGoal: 3,
  fadeDistance: 18,
  blur: 0.016,
  highlights: 0.5,
};

/**
 * The game's depth of field: like a camera focused on the goal, things get softer the further
 * behind the goal they are (so the rows of the crowd behind it each get a little softer than the
 * one in front), with round, soft blur like a real lens. The goal, the keeper and everything
 * nearer stay sharp, and so do the sky, the trees and the floodlights. Blur sizes are shares of
 * the screen's height, so it looks the same at every sharpness and on phones.
 */
export interface DepthOfFieldSettings {
  /** Blur what's far behind the goal. */
  depthOfField: boolean;
  /** How far behind the goal line things start to get soft, in metres (the net reaches about 2 m back). */
  sharpBehindGoal: number;
  /** How many metres further they take to get as soft as they get. */
  fadeDistance: number;
  /** How soft the softest things get: the blur's width, as a share of the screen's height. */
  blur: number;
}

export const DEPTH_OF_FIELD_SETTINGS: DepthOfFieldSettings = {
  depthOfField: true,
  sharpBehindGoal: 3,
  fadeDistance: 18,
  blur: 0.016,
};

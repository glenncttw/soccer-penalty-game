/**
 * The crowd's depth of field: like a camera focused on the goal, the people in the stands are a
 * little out of focus, with round, soft blur like a real lens, while everything else (the goal,
 * the keeper, the stands themselves, the trees, the floodlights, the sky) stays sharp. Blur sizes
 * are shares of the screen's height, so it looks the same at every sharpness and on phones.
 */
export interface DepthOfFieldSettings {
  /** Blur the crowd. */
  depthOfField: boolean;
  /** How soft the furthest people get: the blur's width, as a share of the screen's height. */
  blur: number;
  /** 0..1: how soft the nearest people (the side stands close to the camera) get, compared with the furthest. */
  nearBlur: number;
  /** People this close to the camera, in metres, get `nearBlur`... */
  nearDistance: number;
  /** ...and people this far away get the full `blur`, with a smooth change in between. */
  farDistance: number;
}

export const DEPTH_OF_FIELD_SETTINGS: DepthOfFieldSettings = {
  depthOfField: true,
  blur: 0.012,
  nearBlur: 0.5,
  nearDistance: 8,
  farDistance: 25,
};

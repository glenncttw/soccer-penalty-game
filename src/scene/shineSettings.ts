/**
 * How shiny things are: the toy-like gloss that mirrors a soft picture of the stadium and the sky. Roughness is
 * 0..1: 0 is a sharp mirror, 1 is fully matt. Reflection is how strongly the stadium and sky show in it (0 = not
 * at all). Shiny surfaces reflect most where you see them at a slant, like real plastic.
 */
export interface ShineSettings {
  /** The ad boards. */
  boardRoughness: number;
  boardReflection: number;
  /** The goal posts and crossbar. */
  goalRoughness: number;
  goalReflection: number;
  /** The walls, steps and stairs. Their colours stay as baked in Blender; the gloss goes on top. */
  standsRoughness: number;
  standsReflection: number;
  /** The railings. */
  railRoughness: number;
  railReflection: number;
  /** The trees behind the stands. */
  treeRoughness: number;
  treeReflection: number;
  /** The crowd's skin, clothes and hats. */
  crowdRoughness: number;
  /** The keeper; scales the roughness painted on the model (1 = as painted). */
  keeperRoughness: number;
}

export const SHINE_SETTINGS: ShineSettings = {
  boardRoughness: 0.15,
  boardReflection: 1.2,
  goalRoughness: 0.15,
  goalReflection: 1,
  standsRoughness: 0.35,
  standsReflection: 0.8,
  railRoughness: 0.15,
  railReflection: 1.5,
  treeRoughness: 0.35,
  treeReflection: 1,
  crowdRoughness: 0.25,
  keeperRoughness: 0.6,
};

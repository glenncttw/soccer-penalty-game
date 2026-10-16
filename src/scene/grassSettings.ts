/**
 * Everything you can tweak about the pitch's grass. Colours are CSS hex strings
 * (sRGB, as a colour picker shows them); sizes are in metres.
 *
 * Where the light and dark stripes are comes from the Blender model (the two
 * grass materials on PITCH_Grass), so move or resize stripes there.
 */
export interface GrassSettings {
  /** Colour of the light and the dark stripes, before sunlight and shading. */
  colorLight: string;
  colorDark: string;
  /** How wide the blend between two stripes is. 0 = a razor-sharp edge. */
  stripeSoftness: number;
  /** How far the tiny blades nibble into the next stripe, so edges look mown, not painted. */
  stripeRagged: number;
  /** Size of one tile of the tiny-blade texture. Smaller = finer blades. */
  bladeTileSize: number;
  /**
   * How much longer the blades are toward the goal than across. You see the
   * grass from a low angle, which squashes it; stretching makes the blades look
   * like they stand up. 1 = no stretch.
   */
  bladeStretch: number;
  /** How strongly the tiny blades show. 0 = smooth colour; above 2 they look rough. */
  bladeContrast: number;
  /** 0..1: how much yellower the blade tips are than the gaps between them. */
  bladeTipWarmth: number;
  /**
   * 0..1: how much darker the grass looks where you look down onto it (in front
   * of you) than where you look across it (near the goal). Real grass does this.
   */
  angleShading: number;
  /** Any whole number. The same seed always draws the same blades. */
  bladeSeed: number;
}

/** The game's grass, tuned to the stylised reference picture. */
export const GRASS_SETTINGS: GrassSettings = {
  colorLight: '#619033',
  colorDark: '#51872f',
  stripeSoftness: 0.01,
  stripeRagged: 0.01,
  bladeTileSize: 0.6,
  bladeStretch: 2.5,
  bladeContrast: 1.7,
  bladeTipWarmth: 0.4,
  angleShading: 0.53,
  bladeSeed: 3,
};

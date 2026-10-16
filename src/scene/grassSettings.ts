/**
 * Everything you can tweak about the pitch's grass. Colours are CSS hex strings
 * (sRGB, as a colour picker shows them); sizes are in metres.
 *
 * Where the stripes and the white lines are comes from the Blender model, so
 * move or resize them there. The grass texture's two pictures live in
 * public/assets/grass/ (see docs/grass-textures.md for how to make them).
 */
export interface GrassSettings {
  /** Colour of the light and the dark stripes. The texture adds detail around these colours, it doesn't replace them. */
  colorLight: string;
  colorDark: string;
  /** How wide the blend between two stripes is. 0 = a razor-sharp edge. */
  stripeSoftness: number;
  /** How far a stripe edge wobbles and how far blades poke across it, so it looks mown instead of ruled. */
  stripeRagged: number;
  /** How much of the pitch one copy of the texture covers. Smaller = finer grass. */
  textureTileSize: number;
  /**
   * How much longer the texture is toward the goal than across. You see the
   * grass from a low angle, which squashes it; stretching makes the blades look
   * like they stand up. 1 = no stretch.
   */
  textureStretch: number;
  /** 0..1: how much of the colour texture's variation shows. 0 = plain stripe colours. */
  textureStrength: number;
  /** How strongly the normal map's bumps catch the light. 0 = flat. It fades out with distance by itself. */
  normalStrength: number;
  /** 0..1: soft lighter and darker patches across the pitch, so it looks less flat. */
  patchStrength: number;
  /** Size of those patches. */
  patchSize: number;
  /**
   * 0..1: how much darker the grass looks where you look down onto it (in front
   * of you) than where you look across it (near the goal). Real grass does this.
   */
  angleShading: number;
  /** Colour of the painted lines and penalty spot. */
  lineColor: string;
  /** How far blades poke out of the edges of the painted lines and spot. */
  lineRagged: number;
}

/** The game's grass, tuned to the stylised reference picture. */
export const GRASS_SETTINGS: GrassSettings = {
  colorLight: '#619033',
  colorDark: '#51872f',
  stripeSoftness: 0.03,
  stripeRagged: 0.03,
  textureTileSize: 0.5,
  textureStretch: 3,
  textureStrength: 1,
  normalStrength: 2.5,
  patchStrength: 0.05,
  patchSize: 1.5,
  angleShading: 0.53,
  lineColor: '#f8eedf',
  lineRagged: 0.04,
};

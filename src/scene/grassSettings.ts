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
  /**
   * Width of the see-through stripes running left to right over the stripes,
   * counted from the goal line, with gaps as wide in between. 0 = no cross stripes.
   */
  crossStripeWidth: number;
  /** 0..1: how see-through the cross stripes are. 0 = invisible, 1 = as dark as a dark stripe. */
  crossStripeOpacity: number;
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
  /** How far blades poke out of the edges of the painted lines and spot (only seen up close). */
  lineRagged: number;
  /**
   * How far (m) the edges of the painted lines wave in and out, slowly, over 20 to 50 cm. Unlike the
   * blades, this stays visible on the far lines.
   */
  lineWobble: number;
  /** 0..1: how much of the grass texture's light and dark shows through the paint. 0 = flat paint. */
  lineTexture: number;
  /** 0..1: how much of the grass's green shows through the paint. 0 = the paint's own colour. */
  lineGrassTint: number;
}

/** The game's grass, tuned to the stylised reference picture. */
export const GRASS_SETTINGS: GrassSettings = {
  colorLight: '#65943e',
  colorDark: '#4d8135',
  stripeSoftness: 0.03,
  stripeRagged: 0.03,
  crossStripeWidth: 1.9,
  crossStripeOpacity: 0.3,
  textureTileSize: 0.8,
  textureStretch: 1.5,
  textureStrength: 0.38,
  normalStrength: 0.2,
  patchStrength: 0.05,
  patchSize: 1.5,
  angleShading: 0.25,
  lineColor: '#ebe8de',
  lineRagged: 0.04,
  lineWobble: 0.05,
  lineTexture: 0.6,
  lineGrassTint: 0.1,
};

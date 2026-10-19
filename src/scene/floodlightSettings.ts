/**
 * The soft glow around the floodlight lamps. Colours are CSS hex strings (sRGB, as a
 * colour picker shows them).
 */
export interface FloodlightSettings {
  /** Draw the glow. */
  glow: boolean;
  /** Size of the glow, as a share of the lamp panel's width (1 = as wide as the panel). */
  glowSize: number;
  /** 0..1: how bright the glow is. */
  glowOpacity: number;
  /** Colour in the middle of the glow; it fades out to nothing at the edge. */
  glowColor: string;
}

export const FLOODLIGHT_SETTINGS: FloodlightSettings = {
  glow: true,
  glowSize: 3,
  glowOpacity: 0.45,
  glowColor: '#fff6dc',
};

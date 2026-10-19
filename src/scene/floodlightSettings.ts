/**
 * The soft glow on the floodlight lamps. Colours are CSS hex strings (sRGB, as a colour picker
 * shows them).
 */
export interface FloodlightSettings {
  /** Draw the glow. */
  glow: boolean;
  /** How far each lamp's halo reaches, in lamp radii from its middle (1 = only the lamp itself). */
  glowSize: number;
  /** 0..1: how bright the glow is. */
  glowOpacity: number;
  /** Colour the lamps light up with. */
  glowColor: string;
  /** Colour of the halo around each lamp; it fades out to nothing. */
  glowEdgeColor: string;
}

export const FLOODLIGHT_SETTINGS: FloodlightSettings = {
  glow: true,
  glowSize: 1.7,
  glowOpacity: 0.7,
  glowColor: '#ffffff',
  glowEdgeColor: '#ffc89a',
};

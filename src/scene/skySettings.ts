/**
 * Everything you can tweak about the sky and its clouds. Colours are CSS hex
 * strings (sRGB, as a colour picker shows them); angles are in degrees.
 *
 * Elevation is measured up from the horizon. In the gameplay view the sky shows
 * from about 8° (the top of the far stand) to about 15° at the top of a desktop
 * screen, and up to about 24° on a phone held upright.
 */
export interface SkySettings {
  /** Draw the clouds. Turning them off keeps the sky's colour gradient. */
  clouds: boolean;
  /** Clouds in each 120° of sky, over all four layers (up to 16). */
  cloudCount: number;
  /** Size of every cloud. 1 = the nearest clouds are about 12° wide. */
  cloudScale: number;
  /** 0..1: how much cloud widths differ from each other. */
  cloudWidthVariation: number;
  /** 0..1: how much cloud heights (puffiness) differ from each other. */
  cloudHeightVariation: number;
  /** Drift of the nearest layer, in degrees per second. Negative drifts left. */
  cloudSpeed: number;
  /** 0..1: how see-through the clouds are (1 = solid). */
  cloudOpacity: number;
  /** Width of the soft edge, as a share of a cloud's height. */
  cloudSoftness: number;
  /** Colour of the sunlit tops. */
  cloudColorTop: string;
  /** Colour of the shaded, flat bottoms. */
  cloudColorBottom: string;
  /** 0..1: a hint of warm sunlight on the bright upper parts. */
  cloudWarmth: number;
  /** 0..1: how strongly overlapping lobes shade each other. */
  cloudShading: number;
  /** Direction the light comes from, seen from where you stand: x right, y up, z toward you. */
  lightDirection: [number, number, number];
  /** Sky colour high up, and down at the horizon. */
  skyColorTop: string;
  skyColorBottom: string;
  /** Elevations where the sky reaches its bottom and top colour. */
  skyBottomElevation: number;
  skyTopElevation: number;
  /** Any whole number. The same seed always makes the same clouds. */
  cloudSeed: number;
  /** 0..1: how much of the sky has clouds. 1 = every cloud, 0 = a clear sky (clouds fade out one by one). */
  cloudCoverage: number;
  /** 0..1: how much smaller, slower, lower and hazier the far layers are. 0 = all layers look alike. */
  cloudLayerDepth: number;
}

/** The game's sky, tuned to the stylised reference picture: puffy white clouds with blue bottoms. */
export const SKY_SETTINGS: SkySettings = {
  clouds: true,
  cloudCount: 14,
  cloudScale: 1,
  cloudWidthVariation: 0.5,
  cloudHeightVariation: 0.5,
  cloudSpeed: 0.2,
  cloudOpacity: 1,
  cloudSoftness: 0.025,
  cloudColorTop: '#fbfbfe',
  cloudColorBottom: '#93caf9',
  cloudWarmth: 0.5,
  cloudShading: 0.6,
  // From the right, 35° up: the same side as the stadium's sun.
  lightDirection: [0.82, 0.57, 0],
  skyColorTop: '#369dfc',
  skyColorBottom: '#7bcdfd',
  skyBottomElevation: 6,
  skyTopElevation: 22,
  cloudSeed: 7,
  cloudCoverage: 1,
  cloudLayerDepth: 0.8,
};

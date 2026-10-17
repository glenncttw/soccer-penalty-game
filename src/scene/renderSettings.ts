/**
 * Everything you can tweak about how the finished picture looks: tone mapping, colour
 * grading and the optional effects. Colours are CSS hex strings (sRGB, as a colour
 * picker shows them); distances are in metres from the camera.
 *
 * All of it happens after the scene is drawn, in src/scene/renderPipeline.ts.
 */
export type ToneMappingMode = 'none' | 'neutral' | 'aces' | 'agx';

export interface RenderSettings {
  /**
   * How light brighter than white is turned into screen colours, using three.js's own curves:
   * - 'neutral' (Khronos PBR Neutral) keeps the baked colours and only rounds off the brightest parts,
   * - 'none' cuts off everything brighter than white, as the game did before,
   * - 'aces' and 'agx' are filmic curves; they turn this sky pale and the greens grey.
   */
  toneMapping: ToneMappingMode;
  /** Brightness before tone mapping. 1 = as drawn. */
  exposure: number;
  /** 1 = unchanged, lower = calmer colours, higher = more vivid. */
  saturation: number;
  /** 1 = unchanged, higher = punchier. The darkest and brightest colours stay put, so nothing clips. */
  contrast: number;
  /** White balance: positive = warmer (yellower), negative = cooler (bluer). 0 = unchanged. */
  warmth: number;
  /** How far the darkest parts are lifted toward `shadowTint`, so shadows are never black. 0 = not at all. */
  shadowLift: number;
  shadowTint: string;
  /** A soft glow around the floodlights and anything else brighter than `bloomThreshold`. */
  bloom: boolean;
  bloomStrength: number;
  /**
   * How bright something must be before it glows, in the scene's light before exposure: sunlit
   * white (the ball, the goal) reaches about 2, the floodlight lamps up to 4.5. It starts softly,
   * from half this value.
   */
  bloomThreshold: number;
  /** 0..1: how far the glow spreads. 0 = a tight halo, 1 = a wide haze. */
  bloomRadius: number;
  /** Blurs what's behind the goal, like a camera focused on the goal. The goal, net, keeper and ball stay sharp. */
  depthOfField: boolean;
  /** 0..1: how blurry the background gets. */
  depthOfFieldStrength: number;
  /** How far behind the back of the net the blur takes to build up. */
  depthOfFieldRange: number;
  /** 0..1: how much far-away things (stands, floodlights, trees) fade toward `atmosphereColor`. 0 = none. */
  atmosphere: number;
  atmosphereColor: string;
  /** Where the haze starts, and where it reaches `atmosphere`. */
  atmosphereStart: number;
  atmosphereEnd: number;
  /** A tiny noise that stops smooth gradients like the sky from showing bands. */
  dithering: boolean;
  /** Moving film grain. 0 = none; keep it tiny. */
  grain: number;
  /** Edge smoothing (MSAA) samples per pixel: 0 = off, 4 = smooth edges. */
  antialiasSamples: number;
  /** The most screen pixels drawn per CSS pixel. Phones often have 3; drawing that many costs a lot. */
  maxPixelRatio: number;
}

/** The game's look: the art direction of the bakes, with soft highlights and glowing floodlights. */
export const RENDER_SETTINGS: RenderSettings = {
  toneMapping: 'neutral',
  exposure: 1.3,
  saturation: 0.9,
  contrast: 1,
  warmth: 0,
  shadowLift: 0.03,
  shadowTint: '#99bfff',
  bloom: true,
  bloomStrength: 2.5,
  bloomThreshold: 2,
  bloomRadius: 0.3,
  depthOfField: false,
  depthOfFieldStrength: 0.5,
  depthOfFieldRange: 15,
  atmosphere: 0.15,
  atmosphereColor: '#7bcdfd',
  atmosphereStart: 20,
  atmosphereEnd: 40,
  dithering: true,
  grain: 0,
  antialiasSamples: 4,
  maxPixelRatio: 2,
};

/** The game before the rendering polish: no tone mapping, grading or effects. */
export const BASELINE_RENDER_SETTINGS: RenderSettings = {
  ...RENDER_SETTINGS,
  toneMapping: 'none',
  exposure: 1,
  saturation: 1,
  contrast: 1,
  warmth: 0,
  shadowLift: 0,
  bloom: false,
  depthOfField: false,
  atmosphere: 0,
  grain: 0,
};

/** Starting points for the rendering panel (`npm run dev`, then add ?edit). */
export const RENDER_PRESETS: Record<string, RenderSettings> = {
  Baseline: BASELINE_RENDER_SETTINGS,
  Polished: RENDER_SETTINGS,
};

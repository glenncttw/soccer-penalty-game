/**
 * How sharp the game is drawn: the number of real screen pixels drawn for each CSS pixel (the "pixel ratio").
 * The page always fills the whole screen; only the picture behind it gets more or fewer pixels. A phone
 * screen has 2 or 3 real pixels per CSS pixel, and drawing all of them costs a lot: 1.5 instead of 3 draws a
 * quarter of the pixels. The game never draws more pixels than the screen really has.
 *
 * Add ?bench to the game's address for the test panel that switches between these live and measures each one.
 */
export interface ResolutionSettings {
  /** Highest pixel ratio on a computer (a mouse or trackpad). */
  desktopMax: number;
  /** The phone and tablet choices (a touch screen). */
  mobilePresets: Record<MobilePreset, number>;
  /** Which of them phones use. */
  mobilePreset: MobilePreset;
}

export type MobilePreset = 'high' | 'balanced' | 'performance';

export const RESOLUTION_SETTINGS: ResolutionSettings = {
  desktopMax: 1.5,
  mobilePresets: { high: 1.5, balanced: 1.25, performance: 1.0 },
  // Not measured yet on a real phone: pick from the ?bench results.
  mobilePreset: 'high',
};

/** The pixel ratio to draw at: the setting for this kind of device, never more than the screen's own. */
export function pickPixelRatio(screenRatio: number, touchScreen: boolean, settings = RESOLUTION_SETTINGS) {
  const wanted = touchScreen ? settings.mobilePresets[settings.mobilePreset] : settings.desktopMax;
  return clampPixelRatio(wanted, screenRatio);
}

/** `wanted`, but never more than the screen's own pixel ratio (and never below a tenth). */
export function clampPixelRatio(wanted: number, screenRatio: number) {
  return Math.max(0.1, Math.min(wanted, screenRatio || 1));
}

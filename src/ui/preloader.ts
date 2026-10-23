import * as THREE from 'three';

/**
 * The loading bar in index.html, over the whole screen until the game is ready to play. It shows straight away
 * while the game's code downloads, then fills as the files arrive (every three.js loader reports to the default
 * loading manager; the stadium byte by byte) and then as the game is set up, step by step (see src/main.ts).
 */
const USUAL_FILES = 24; // the stadium, its panorama and baked light, the keeper, the grass, the chip, the crowd's...
const FILES_SHARE = 0.65; // of the bar: the files; the rest is for setting the game up
const USUAL_STEPS = 12; // the set-up steps in main.ts (each `step` counts one, or as many as it says)

export class Preloader {
  private readonly el = document.querySelector<HTMLElement>('#loading');
  private readonly fill = this.el?.querySelector<HTMLElement>('.bar > div') ?? null;
  private loaded = 0;
  private total = 0;
  /** How far the file being followed byte by byte (the stadium) has got, 0..1. */
  private partial = 0;
  private steps = 0;
  private partSteps = 0; // of a long step that's on its way
  private shown = 0.05;

  constructor() {
    THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => {
      this.loaded = loaded;
      this.total = total;
      this.partial = 0;
      this.draw();
    };
  }

  /** Progress (0..1) of a big file that's still downloading, for a smoother bar. */
  file(fraction: number) {
    this.partial = Math.min(1, fraction);
    this.draw();
  }

  /**
   * A set-up step (worth `steps` of the usual ones) is done: the page draws a frame (so the bar moves on), then
   * the next one starts.
   */
  step(steps = 1) {
    this.steps += steps;
    this.partSteps = 0;
    this.draw();
    return nextPaint();
  }

  /** A long set-up step, worth `steps` of the usual ones, is `fraction` (0..1) of the way. */
  partly(fraction: number, steps: number) {
    this.partSteps = Math.min(1, fraction) * steps;
    this.draw();
  }

  /** The game is ready: fill the bar up and take the loading screen away. */
  async done() {
    THREE.DefaultLoadingManager.onProgress = () => {};
    this.show(1, 0.15);
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.el?.remove();
  }

  private draw() {
    // More files join the list as earlier ones finish, so count at least the usual number.
    const files = Math.min(1, (this.loaded + this.partial) / Math.max(this.total, USUAL_FILES));
    const steps = Math.min(1, (this.steps + this.partSteps) / USUAL_STEPS);
    this.show(0.05 + (1 - 0.05) * (FILES_SHARE * files + (1 - FILES_SHARE) * steps), 0.3);
  }

  /** Grows the bar to `to` over `seconds`, slowing down toward the end; it never goes backwards. */
  private show(to: number, seconds: number) {
    if (!this.fill || to <= this.shown) return;
    this.shown = to;
    this.fill.style.transitionDuration = `${seconds}s`;
    this.fill.style.transform = `scaleX(${to})`;
  }
}

/**
 * Resolves once the browser has drawn the page with the latest changes (or after a moment, in a tab that's
 * out of sight and draws nothing).
 */
export function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
    setTimeout(resolve, 100);
  });
}

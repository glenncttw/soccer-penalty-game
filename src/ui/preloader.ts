import * as THREE from 'three';

/**
 * The loading bar in index.html. It shows straight away while the game's code downloads,
 * then fills as the stadium, keeper, grass and baked light arrive (every three.js loader
 * reports to the default loading manager), and goes away once the game is ready.
 */
const USUAL_FILES = 14; // what the game loads now: stadium, keeper, grass, baked light and its decoder

export class Preloader {
  private readonly el = document.querySelector<HTMLElement>('#loading');
  private readonly fill = this.el?.querySelector<HTMLElement>('div') ?? null;
  private loaded = 0;
  private total = 0;
  /** How far the file being followed byte by byte (the stadium) has got, 0..1. */
  private partial = 0;
  private shown = 0;

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

  /** The game is ready: take the bar away. */
  done() {
    THREE.DefaultLoadingManager.onProgress = () => {};
    this.el?.remove();
  }

  private draw() {
    if (!this.fill) return;
    // More files join the list as earlier ones finish, so count at least the usual number,
    // never let the bar go backwards, and keep the last bit for setting up the game.
    const f = Math.min(1, (this.loaded + this.partial) / Math.max(this.total, USUAL_FILES));
    this.shown = Math.max(this.shown, 0.05 + 0.9 * f);
    this.fill.style.width = `${(this.shown * 100).toFixed(1)}%`;
  }
}

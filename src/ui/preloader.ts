import * as THREE from 'three';

/**
 * The loading bar in index.html. It shows straight away while the game's code downloads, then fills as
 * what the landing needs arrives (every three.js loader reports to the default loading manager): the stadium,
 * the panorama's light, the chips and the crowd's small models. The rest of the game loads behind the
 * landing (see GameLoading).
 */
const USUAL_FILES = 10; // the stadium, the panorama, the chip, the crowd's six models and the flag logo
const FILES_END = 0.9; // how far the bar is once those are in; the rest is for setting the landing up

export class Preloader {
  private readonly el = document.querySelector<HTMLElement>('#loading');
  private readonly fill = this.el?.querySelector<HTMLElement>('div') ?? null;
  private loaded = 0;
  private total = 0;
  /** How far the file being followed byte by byte (the stadium) has got, 0..1. */
  private partial = 0;
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

  /** The landing is ready: fill the bar up and take it away. */
  async done() {
    THREE.DefaultLoadingManager.onProgress = () => {};
    this.show(1, 0.15);
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.el?.remove();
  }

  private draw() {
    // More files join the list as earlier ones finish, so count at least the usual number.
    const f = Math.min(1, (this.loaded + this.partial) / Math.max(this.total, USUAL_FILES));
    this.show(0.05 + (FILES_END - 0.05) * f, 0.2);
  }

  /** Grows the bar to `to` over `seconds`, slowing down toward the end; it never goes backwards. */
  private show(to: number, seconds: number) {
    if (!this.fill || to <= this.shown) return;
    this.shown = to;
    this.fill.style.transitionDuration = `${seconds}s`;
    this.fill.style.transform = `scaleX(${to})`;
  }
}

const FILES_SHARE = 0.7; // of the bar on the button: the rest is for the set-up steps
const USUAL_STEPS = 9; // the set-up steps in main.ts (each ends with `frame`)

/**
 * How far the game has got loading behind the landing (0..1), for the bar on the Speel nu button: each file
 * counts as it arrives, each set-up step as it's done.
 */
export class GameLoading {
  private files = 0;
  private filesIn = 0;
  private steps = 0;

  constructor(private readonly show: (fraction: number) => void) {
    show(0);
  }

  /** Counts `file` (anything being downloaded or worked out in the background) in; returns it as it is. */
  file<T>(file: Promise<T>): Promise<T> {
    this.files++;
    void file.then(
      () => {
        this.filesIn++;
        this.draw();
      },
      () => {},
    );
    return file;
  }

  /** A set-up step is done: the page draws a frame (so the landing keeps moving), then the next one starts. */
  frame() {
    this.steps++;
    this.draw();
    return nextPaint();
  }

  private draw() {
    const files = this.files ? this.filesIn / this.files : 1;
    this.show(FILES_SHARE * files + (1 - FILES_SHARE) * Math.min(1, this.steps / USUAL_STEPS));
  }
}

/**
 * Resolves once the browser has drawn the page with the latest changes (or after a moment, in a tab that's
 * out of sight and draws nothing).
 */
function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
    setTimeout(resolve, 100);
  });
}

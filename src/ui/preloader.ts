import * as THREE from 'three';

/**
 * The loading bar in index.html. It shows straight away while the game's code downloads,
 * then fills as the stadium and the crowd's models arrive (every three.js loader reports to the
 * default loading manager), then as the keeper, grass and baked light arrive (`filesUntil`).
 * The rest of the bar is for setting the game up
 * (placing the crowd, preparing the shaders), which keeps the page too busy to redraw it:
 * for those steps the bar is told how long they usually take and the browser moves it along
 * by itself (a transform transition runs even while the page is busy).
 */
const USUAL_FILES = 9; // what loads first: the stadium, the crowd's six models, the landing's chip and the flag logo
const FILES_END = 0.5; // how far the bar is once those are in; the rest is for the later files and setting up
// The files that download after the stadium (keeper, grass, baked light) are about two and a half times its size.
const REST_PER_STADIUM = 2.5;

export class Preloader {
  private readonly el = document.querySelector<HTMLElement>('#loading');
  private readonly fill = this.el?.querySelector<HTMLElement>('div') ?? null;
  private loaded = 0;
  private total = 0;
  /** How far the file being followed byte by byte (the stadium) has got, 0..1. */
  private partial = 0;
  private shown = 0.05;
  private readonly started = performance.now();
  /** When the stadium was in, and how many seconds it took. */
  private stadium: { at: number; seconds: number } | null = null;
  /** Set by `filesUntil`: the files still to come move the bar on from `from` to `to`. */
  private rest: { from: number; to: number; count: number; done: number } | null = null;

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
   * Before a set-up step that keeps the page busy for about `seconds`: moves the bar on to `to`
   * over that time, and waits until the browser has started moving it.
   */
  async step(to: number, seconds: number) {
    this.show(to, seconds);
    await nextPaint();
  }

  /** The stadium is in: how long it took tells how long the files after it will take (see `filesUntil`). */
  stadiumLoaded() {
    const now = performance.now();
    this.stadium = { at: now, seconds: (now - this.started) / 1000 };
  }

  /**
   * While the page waits for the files that are still downloading (they came in alongside a set-up step):
   * moves the bar on from where it is to `to` as they arrive.
   */
  filesUntil(to: number, files: Promise<unknown>[]) {
    const rest = (this.rest = { from: this.shown, to, count: files.length, done: 0 });
    THREE.DefaultLoadingManager.onProgress = () => {};
    for (const file of files)
      void file.then(() => {
        rest.done++;
        this.draw();
      });
    // They tend to arrive all together at the end (they share the connection), so meanwhile the bar
    // glides on by itself over about the time they should take, judged by how long the stadium took.
    if (this.stadium) {
      const left = this.stadium.seconds * REST_PER_STADIUM - (performance.now() - this.stadium.at) / 1000;
      if (left > 0.5) this.show(rest.from + (to - rest.from) * 0.9, left);
    }
  }

  /** The game is ready: fill the bar up and take it away. */
  async done() {
    THREE.DefaultLoadingManager.onProgress = () => {};
    this.show(1, 0.15);
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.el?.remove();
  }

  private draw() {
    if (this.rest) {
      const { from, to, count, done } = this.rest;
      return this.show(from + ((to - from) * done) / count, 0.2);
    }
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

/** Resolves once the browser has drawn the page with the latest changes. */
function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

import * as THREE from 'three';

/**
 * The loading screen in index.html, over the whole screen until the game is ready to play. It shows straight away
 * while the game's code downloads, then its ring fills as the files arrive (every three.js loader reports to the
 * default loading manager; the stadium byte by byte) and then as the game is set up, step by step (see
 * src/main.ts).
 */
const USUAL_FILES = 24; // the stadium, its panorama and baked light, the keeper, the grass, the chip, the crowd's...
const FILES_SHARE = 0.65; // of the bar: the files; the rest is for setting the game up
const USUAL_STEPS = 12; // the set-up steps in main.ts (each `step` counts one, or as many as it says)
const OPEN_TIME = 600; // milliseconds: the red opening onto the landing (loading-open in style.css)
const EASE = 'cubic-bezier(0.25, 0.6, 0.4, 1)';

export class Preloader {
  private readonly el = document.querySelector<HTMLElement>('#loading');
  private readonly ring = this.el?.querySelector<HTMLElement>('.loading-ring') ?? null;
  private readonly right = this.el?.querySelector<HTMLElement>('.loading-half.right > i') ?? null;
  private readonly left = this.el?.querySelector<HTMLElement>('.loading-half.left > i') ?? null;
  private readonly percent = this.el?.querySelector<HTMLElement>('.loading-percent') ?? null;
  private loaded = 0;
  private total = 0;
  /** How far the file being followed byte by byte (the stadium) has got, 0..1. */
  private partial = 0;
  private steps = 0;
  private partSteps = 0; // of a long step that's on its way
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

  /**
   * The game is ready: the ring fills up, then the loading screen opens onto the game (and goes once it's open).
   * Resolves as it starts opening, so the landing's entrance comes in with it.
   */
  async done() {
    THREE.DefaultLoadingManager.onProgress = () => {};
    this.show(1, 0.15);
    await new Promise((resolve) => setTimeout(resolve, 250));
    this.el?.classList.add('opening');
    setTimeout(() => this.el?.remove(), OPEN_TIME);
  }

  private draw() {
    // More files join the list as earlier ones finish, so count at least the usual number.
    const files = Math.min(1, (this.loaded + this.partial) / Math.max(this.total, USUAL_FILES));
    const steps = Math.min(1, (this.steps + this.partSteps) / USUAL_STEPS);
    this.show(FILES_SHARE * files + (1 - FILES_SHARE) * steps, 0.3);
  }

  /**
   * Fills the ring to `to` (0..1) over `seconds`, slowing down toward the end; it never goes backwards. The right
   * half fills first, then the left: when it goes past halfway, the left half waits for the right one.
   */
  private show(to: number, seconds: number) {
    if (!this.right || !this.left || to <= this.shown) return;
    const from = this.shown;
    this.shown = to;
    const split = from < 0.5 && to > 0.5;
    const first = split ? (seconds * (0.5 - from)) / (to - from) : seconds;
    turn(this.right, Math.min(to, 0.5), first, 0, split ? 'linear' : EASE);
    turn(
      this.left,
      Math.max(to - 0.5, 0),
      split ? seconds - first : seconds,
      split ? first : 0,
      split ? 'linear' : EASE,
    );
    const shown = `${Math.round(to * 100)}`;
    if (this.percent) this.percent.textContent = `${shown}%`;
    this.ring?.setAttribute('aria-valuenow', shown);
  }
}

/** Turns one half of the ring so `share` (0..0.5) of the whole ring shows filled, over `seconds` after `delay`. */
function turn(half: HTMLElement, share: number, seconds: number, delay: number, easing: string) {
  const s = half.style;
  s.transitionDuration = `${seconds}s`;
  s.transitionDelay = `${delay}s`;
  s.transitionTimingFunction = easing;
  s.transform = `rotate(${45 + share * 360}deg)`;
  if (share > 0) s.visibility = 'visible';
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

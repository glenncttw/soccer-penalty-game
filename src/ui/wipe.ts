/**
 * A quick comic-style wipe: a slanted band of colour sweeps over the screen and off again.
 * While it covers the screen, whatever is behind it can change without anyone seeing.
 * Also shows the replay's labels ("REPLAY" and "Tap to skip").
 */
export class Wipe {
  private readonly band: HTMLElement;
  private readonly tag: HTMLElement;
  /** 0..1 covering, 1..2 uncovering; null when idle. */
  private progress: number | null = null;
  private onCovered: (() => void) | null = null;
  private onDone: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly time: number,
  ) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="replay-tag" hidden><span class="replay-word">REPLAY</span><span class="replay-skip">Tap to skip</span></div>
       <div class="wipe" hidden></div>`,
    );
    this.band = root.querySelector('.wipe')!;
    this.tag = root.querySelector('.replay-tag')!;
  }

  get running() {
    return this.progress !== null;
  }

  /** Sweeps in, calls `onCovered` once the screen is fully covered, sweeps out, then calls `onDone`. */
  run(onCovered: () => void, onDone: () => void = () => {}) {
    this.progress = 0;
    this.onCovered = onCovered;
    this.onDone = onDone;
    this.band.hidden = false;
    this.draw();
  }

  update(realDt: number) {
    if (this.progress === null) return;
    const before = this.progress;
    this.progress = Math.min(2, this.progress + realDt / this.time);
    if (before < 1 && this.progress >= 1) {
      this.progress = 1; // hold one frame fully covered, so the change happens out of sight
      const covered = this.onCovered;
      this.onCovered = null;
      covered?.();
    } else if (this.progress >= 2) {
      this.progress = null;
      this.band.hidden = true;
      const done = this.onDone;
      this.onDone = null;
      done?.();
      return;
    }
    this.draw();
  }

  showReplayTag(on: boolean) {
    this.tag.hidden = !on;
  }

  private draw() {
    const p = this.progress ?? 0;
    const x = p <= 1 ? -(1 - easeInOut(p)) : easeInOut(p - 1);
    this.band.style.transform = `translateX(${(x * 230).toFixed(2)}vw) skewX(-10deg)`;
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

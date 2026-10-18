/** How the wipe moves (see REPLAY_SETTINGS in src/scene/replaySettings.ts). */
export interface WipeTiming {
  /** Seconds the band takes to sweep across the screen, from off the left edge to off the right. */
  wipeTime: number;
}

const SLANT = Math.tan((10 * Math.PI) / 180); // the band leans 10 degrees
const EXTRA = 0.8; // the band is this many screen widths wider than the screen: how long it stays fully covering
const STEPS = 24; // points along the easing curve given to the browser

/**
 * A comic-style wipe: a slanted band of colour with speed lines behind it sweeps across the
 * screen in one smooth movement, never stopping. The band is wider than the screen, so for a
 * moment in the middle it covers everything, and whatever is behind it changes then without
 * anyone seeing. The browser moves the band itself (not the game loop), so it stays smooth
 * even if the game takes a moment longer to draw a frame. Also shows the "REPLAY" label.
 */
export class Wipe {
  private readonly band: HTMLElement;
  private readonly tag: HTMLElement;
  private busy = false;

  constructor(
    root: HTMLElement,
    private readonly timing: WipeTiming,
  ) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="replay-tag" hidden><span class="replay-word">REPLAY</span></div>
       <div class="wipe"></div>`,
    );
    this.band = root.querySelector('.wipe')!;
    this.tag = root.querySelector('.replay-tag')!;
    // Parked just off the left edge, always ready, so it never has to be set up mid-game.
    const { from, width } = this.path();
    this.band.style.width = `${width}px`;
    this.band.style.transform = place(from);
  }

  get running() {
    return this.busy;
  }

  /** Sweeps across, calls `onCovered` while the screen is fully covered, then `onDone` once it's gone. */
  run(onCovered: () => void, onDone: () => void = () => {}) {
    if (this.busy) return;
    this.busy = true;
    const { from, to, middle, width } = this.path();
    this.band.style.width = `${width}px`;
    const keyframes = Array.from({ length: STEPS + 1 }, (_, i) => ({
      offset: i / STEPS,
      transform: place(from + (to - from) * easeInOut(i / STEPS)),
    }));
    const ms = this.timing.wipeTime * 1000;
    const sweep = this.band.animate(keyframes, { duration: ms, fill: 'forwards' });
    // The moment the band is centred over the screen: the middle of the time it covers everything.
    setTimeout(onCovered, ms * easeInOutTime((middle - from) / (to - from)));
    sweep.finished.then(() => {
      this.band.style.transform = place(from);
      sweep.cancel();
      this.busy = false;
      onDone();
    });
  }

  showReplayTag(on: boolean) {
    this.tag.hidden = !on;
  }

  /** Where the band starts (off the left edge), is centred over the screen, and ends (off the right edge), in px. */
  private path() {
    const w = window.innerWidth;
    const lean = SLANT * window.innerHeight; // how far the top of an edge is from its bottom
    const streaks = w * 0.12; // the speed lines trailing behind it (see .wipe::before)
    const width = w * (1 + EXTRA) + lean;
    return {
      width,
      from: -(width + lean / 2) - 2,
      middle: (w - width) / 2,
      to: w + lean / 2 + streaks + 2,
    };
  }
}

function place(x: number) {
  return `translateX(${x.toFixed(1)}px) skewX(-10deg)`;
}

/** Gentle start, fastest in the middle, gentle stop. */
function easeInOut(t: number) {
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** The time (0..1) at which easeInOut reaches `p`. */
function easeInOutTime(p: number) {
  return Math.acos(1 - 2 * p) / Math.PI;
}

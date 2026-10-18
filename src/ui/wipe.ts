/** How the wipe moves (see REPLAY_SETTINGS in src/scene/replaySettings.ts). */
export interface WipeTiming {
  /** Seconds the band takes to slide over the screen (and again to slide off). */
  wipeTime: number;
  /** Seconds it rests over the screen in between, while the game changes behind it. */
  wipeHold: number;
}

const SLANT = Math.tan((10 * Math.PI) / 180); // the band leans 10 degrees
const EDGE = 8; // px of extra band on each side, so no sliver of screen shows while it covers
const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)'; // fast in, soft landing on "covered"
const EASE_IN = 'cubic-bezier(0.32, 0, 0.67, 0)'; // soft start, fast exit

/**
 * A comic-style wipe: a slanted band of colour with speed lines behind it slides over the
 * screen, rests a moment, and slides off. While it covers the screen, whatever is behind it
 * can change without anyone seeing. The browser moves the band itself (not the game loop),
 * so it stays smooth even if the game takes a moment longer to draw a frame.
 * Also shows the replay's labels ("REPLAY" and "Tap to skip").
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
      `<div class="replay-tag" hidden><span class="replay-word">REPLAY</span><span class="replay-skip">Tap to skip</span></div>
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

  /** Slides in, calls `onCovered` once the screen is fully covered, slides off, then calls `onDone`. */
  run(onCovered: () => void, onDone: () => void = () => {}) {
    if (this.busy) return;
    this.busy = true;
    const { from, covered, to, width } = this.path();
    this.band.style.width = `${width}px`;
    this.band.style.transform = place(from);
    const ms = this.timing.wipeTime * 1000;
    const cover = this.band.animate([{ transform: place(from) }, { transform: place(covered) }], {
      duration: ms,
      easing: EASE_OUT,
      fill: 'forwards',
    });
    cover.finished.then(() => {
      onCovered(); // the game swaps what's behind the band now, while it rests
      const leave = this.band.animate([{ transform: place(covered) }, { transform: place(to) }], {
        duration: ms,
        delay: this.timing.wipeHold * 1000,
        easing: EASE_IN,
        fill: 'both',
      });
      cover.cancel();
      leave.finished.then(() => {
        this.band.style.transform = place(this.path().from);
        leave.cancel();
        this.busy = false;
        onDone();
      });
    });
  }

  showReplayTag(on: boolean) {
    this.tag.hidden = !on;
  }

  /** Where the band starts (off the left edge), covers the screen, and ends (off the right edge), in px. */
  private path() {
    const w = window.innerWidth;
    const lean = SLANT * window.innerHeight; // how far the top of an edge is from its bottom
    const streaks = w * 0.12; // the speed lines trailing behind it (see .wipe::before)
    const width = w + lean + 2 * EDGE;
    return {
      width,
      from: -(width + lean / 2) - 2,
      covered: -lean / 2 - EDGE,
      to: w + lean / 2 + streaks + 2,
    };
  }
}

function place(x: number) {
  return `translateX(${x.toFixed(1)}px) skewX(-10deg)`;
}

/**
 * Picks the sharpness for this device by measuring how fast it runs, instead of guessing from its name
 * (iPhones don't say which model they are). While you aim, it times a few seconds of frames:
 * - too slow (under `slowFps`): one step less sharp;
 * - smooth with room to spare: tries one step sharper, and keeps it only if it stays smooth there.
 * A change only happens while the wipe covers the screen, so you never see the picture jump, and at most
 * one step per shot. The result is remembered on the device, so the next visit starts there; each visit
 * checks once more (a phone can be slower in Low Power Mode or when it is hot).
 *
 * Settings are in src/scene/resolutionSettings.ts. ?bench shows what it decided and can forget it.
 */

export interface AutoResolutionSettings {
  /** The sharpness steps to choose from, lowest first. */
  levels: number[];
  /** Seconds of aiming before measuring (the first frames after a change are slower) and measured. */
  settle: number;
  measure: number;
  /** Below this average, go one step down. */
  slowFps: number;
  /** At or above this average, with the slow frames (99th percentile) at most `upMaxMs`, try a step up. */
  upFps: number;
  upMaxMs: number;
  /** A step up is kept only if the average there stays at or above this. */
  keepFps: number;
  /** Days a step found too slow is not tried again (a hot phone can be slow for a while). */
  ceilingDays: number;
}

/** What is remembered on the device between visits. */
export interface AutoMemory {
  /** The chosen sharpness. */
  ratio: number;
  /** The lowest sharpness found too slow, so it isn't tried again for a while, and when (ms since 1970). */
  ceiling: number | null;
  ceilingAt?: number;
}

type Stage = { kind: 'measure' } | { kind: 'trial'; from: number } | { kind: 'done' };

export class AutoResolution {
  /** The sharpness drawn now. */
  ratio: number;
  /** What it will switch to at the next wipe, if anything. */
  pending: number | null = null;
  /** A short line on what it found, for ?bench. */
  status = 'measuring...';
  private stage: Stage = { kind: 'measure' };
  private ceiling: number | null;
  private ceilingAt: number | undefined;
  private gaps: number[] = [];
  private aimingFor = 0;
  private last: number | null = null;

  constructor(
    private readonly settings: AutoResolutionSettings,
    /** The sharpness to start from on a first visit, and the screen's own pixel ratio (never more). */
    start: number,
    private readonly screenRatio: number,
    memory: AutoMemory | null,
    private readonly save: (memory: AutoMemory) => void,
    private readonly now = Date.now(),
  ) {
    const fresh = memory?.ceilingAt !== undefined && now - memory.ceilingAt < settings.ceilingDays * 86_400_000;
    this.ceiling = fresh ? (memory?.ceiling ?? null) : null;
    this.ceilingAt = fresh ? memory?.ceilingAt : undefined;
    this.ratio = this.nearest(memory?.ratio ?? start);
  }

  /** The steps this screen can use. */
  private get levels() {
    const usable = this.settings.levels.filter((l) => l <= this.screenRatio);
    return usable.length ? usable : [Math.min(this.screenRatio, this.settings.levels[0])];
  }

  private nearest(r: number) {
    const ls = this.levels;
    return ls.reduce((best, l) => (Math.abs(l - r) < Math.abs(best - r) ? l : best), ls[0]);
  }

  /** Call every frame with the animation loop's time and whether the player is aiming. */
  frame(time: number, aiming: boolean) {
    const previous = this.last;
    this.last = aiming ? time : null;
    if (!aiming || previous === null || this.pending !== null || this.stage.kind === 'done') return;
    const gap = time - previous;
    if (gap > 250) return this.restart(); // the tab was hidden or the phone froze: start again
    this.aimingFor += gap / 1000;
    if (this.aimingFor < this.settings.settle) return;
    this.gaps.push(gap);
    if (this.aimingFor < this.settings.settle + this.settings.measure) return;
    this.decide();
  }

  /** Call while the wipe covers the screen. True if the sharpness changed (then redraw at `ratio`). */
  applyPending() {
    if (this.pending === null) return false;
    this.ratio = this.pending;
    this.pending = null;
    this.restart();
    return true;
  }

  private restart() {
    this.gaps = [];
    this.aimingFor = 0;
    this.last = null;
  }

  private decide() {
    const s = this.settings;
    const gaps = [...this.gaps].sort((a, b) => a - b);
    const fps = (1000 * gaps.length) / gaps.reduce((a, b) => a + b, 0);
    const p99 = gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.99))];
    const at = `${fps.toFixed(1)} FPS at ${this.ratio}`;
    this.restart();

    // A frame rate held at exactly 30 (iPhone Low Power Mode) says nothing about the phone's speed.
    const at30 = gaps.filter((g) => g > 31 && g < 36).length;
    if (at30 > gaps.length * 0.9) {
      this.status = `${at} looks held at 30 (Low Power Mode?): left as it is`;
      this.stage = { kind: 'done' };
      return;
    }

    const ls = this.levels;
    const i = ls.indexOf(this.ratio);
    if (this.stage.kind === 'trial') {
      const from = this.stage.from;
      if (fps >= s.keepFps) {
        this.status = `${at}: keeping the sharper step`;
        this.finish(this.ratio);
      } else {
        this.status = `${at}: too slow, back to ${from}`;
        this.tooSlow(this.ratio);
        this.pending = from;
        this.finish(from);
      }
      return;
    }

    if (fps < s.slowFps && i > 0) {
      this.status = `${at}: too slow, going to ${ls[i - 1]}`;
      this.tooSlow(this.ratio);
      this.pending = ls[i - 1];
      this.finish(ls[i - 1]);
      return;
    }
    const up = ls[i + 1];
    if (up !== undefined && fps >= s.upFps && p99 <= s.upMaxMs && (this.ceiling === null || up < this.ceiling)) {
      this.status = `${at}: room to spare, trying ${up}`;
      this.stage = { kind: 'trial', from: this.ratio };
      this.pending = up;
      return;
    }
    this.status = `${at}: staying`;
    this.finish(this.ratio);
  }

  private tooSlow(ratio: number) {
    this.ceiling = ratio;
    this.ceilingAt = this.now;
  }

  private finish(ratio: number) {
    this.stage = { kind: 'done' };
    this.save({ ratio, ceiling: this.ceiling, ceilingAt: this.ceilingAt });
  }
}

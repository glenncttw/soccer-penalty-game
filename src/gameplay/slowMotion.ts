/**
 * Slows the game down for a dramatic moment, then eases back to full speed.
 * The camera and HUD keep running in real time.
 */
export class SlowMotion {
  /** How fast game time runs compared with real time (1 = normal). */
  scale = 1;
  private hold = 0;
  private recovery = 1;

  /** Runs the game at `scale` for `hold` real seconds, then speeds back up over `recover` seconds. */
  trigger(scale: number, hold: number, recover: number) {
    this.scale = Math.min(this.scale, scale);
    this.hold = Math.max(this.hold, hold);
    this.recovery = recover;
  }

  /** Advances by `realDt` seconds and returns how many game seconds passed. */
  update(realDt: number): number {
    const before = this.scale;
    if (this.hold > 0) this.hold = Math.max(0, this.hold - realDt);
    else this.scale = Math.min(1, this.scale + realDt / this.recovery);
    return realDt * before;
  }
}

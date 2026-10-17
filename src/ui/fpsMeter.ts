/** A small frames-per-second counter in the bottom left corner, updated twice a second. */
export class FpsMeter {
  private readonly el = document.createElement('div');
  private frames = 0;
  private since: number | null = null;

  constructor(root: HTMLElement) {
    this.el.className = 'fps';
    this.el.textContent = '-- FPS';
    root.appendChild(this.el);
  }

  /** Call once per frame with the frame's time in milliseconds (the animation loop's `time`). */
  tick(now: number) {
    if (this.since === null) this.since = now;
    this.frames++;
    const elapsed = now - this.since;
    if (elapsed < 500) return;
    this.el.textContent = `${Math.round((this.frames * 1000) / elapsed)} FPS`;
    this.frames = 0;
    this.since = now;
  }
}

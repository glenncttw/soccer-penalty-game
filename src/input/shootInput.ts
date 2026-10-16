/**
 * Pointer controls for shooting (mouse and touch):
 *  - move the pointer to aim (on touch, the press point is the aim),
 *  - press and hold to lock the aim and charge power,
 *  - drag sideways while holding to curl,
 *  - release to strike.
 */
const FULL_CURL_DRAG = 0.22; // fraction of the screen width for maximum curl

export class ShootInput {
  /** Pointer in normalized device coordinates (-1..1). */
  readonly pointer = { x: 0, y: 0 };
  hasPointer = false;
  charging = false;
  curl = 0;
  enabled = true;

  onPress: () => void = () => {};
  onRelease: () => void = () => {};

  private downX = 0;
  private pointerId: number | null = null;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.charging) this.hasPointer = false;
    });
  }

  /** Ends the current charge without striking (for example when it times out). */
  forceRelease() {
    if (this.charging) this.finish();
  }

  private setPointer(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.hasPointer = true;
  }

  private move = (e: PointerEvent) => {
    if (this.charging) {
      if (e.pointerId !== this.pointerId) return;
      const r = this.el.getBoundingClientRect();
      const dx = (e.clientX - this.downX) / r.width;
      this.curl = Math.max(-1, Math.min(1, dx / FULL_CURL_DRAG));
      return;
    }
    this.setPointer(e);
  };

  private down = (e: PointerEvent) => {
    if (!this.enabled || this.charging) return;
    e.preventDefault();
    this.setPointer(e);
    this.el.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.downX = e.clientX;
    this.curl = 0;
    this.charging = true;
    this.onPress();
  };

  private up = (e: PointerEvent) => {
    if (!this.charging || e.pointerId !== this.pointerId) return;
    this.finish();
  };

  private finish() {
    this.charging = false;
    if (this.pointerId !== null && this.el.hasPointerCapture(this.pointerId)) {
      this.el.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.onRelease();
  }
}

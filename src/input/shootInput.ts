/**
 * Controls for shooting, with the mouse, touch or the keyboard. Switch between them at any time.
 *
 * Pointer (mouse and touch):
 *  - move the pointer to aim (on touch, the press point is the aim),
 *  - press and hold to lock the aim and charge power,
 *  - drag sideways while holding to curl,
 *  - release to strike.
 *
 * Keyboard (the physical keys, so WASD sits in the same place on an AZERTY keyboard):
 *  - arrow keys or WASD move the aim around the goal, Shift for fine aiming,
 *  - hold Space (or Enter) to lock the aim and charge power,
 *  - left/right (or A/D) while holding to curl; the curl stays where you leave it,
 *  - let go of Space to strike, or press Esc to put the ball back down without a shot.
 */
const FULL_CURL_DRAG = 0.22; // fraction of the screen width for maximum curl

const AIM_SPEED = 0.6; // goal widths (or heights) per second while an arrow key is held
const AIM_FINE = 1 / 3; // with Shift held
const AIM_EASE_IN = 0.25; // seconds to reach full speed, so a tap only nudges the aim
const AIM_START_SPEED = 0.3; // fraction of full speed right at the press
const CURL_SPEED = 1.5; // full curl range per second while left or right is held

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const SHOOT = ['Space', 'Enter', 'NumpadEnter'];
const AIM_KEYS = [...LEFT, ...RIGHT, ...UP, ...DOWN];

export class ShootInput {
  /** Pointer in normalized device coordinates (-1..1). */
  readonly pointer = { x: 0, y: 0 };
  /** The player is aiming (with the pointer or the keys), so there is an aim to show. */
  hasPointer = false;
  /** The keyboard moved the aim last; the pointer takes over again as soon as it moves. */
  usingKeys = false;
  charging = false;
  curl = 0;
  enabled = true;

  onPress: () => void = () => {};
  onRelease: () => void = () => {};
  /** A keyboard charge was called off (Esc, or the window lost focus): no shot. */
  onCancel: () => void = () => {};

  private downX = 0;
  private pointerId: number | null = null;
  private shootKey: string | null = null; // the key holding the current charge
  private readonly held = new Set<string>();
  private heldFor = 0; // seconds an aim key has been held

  constructor(
    private readonly el: HTMLElement,
    keys: EventTarget = window,
  ) {
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.charging && !this.usingKeys) this.hasPointer = false;
    });
    keys.addEventListener('keydown', this.keyDown as EventListener);
    keys.addEventListener('keyup', this.keyUp as EventListener);
    keys.addEventListener('blur', this.blur);
  }

  /** Ends the current charge without striking (for example when it times out). */
  forceRelease() {
    if (this.charging) this.finish();
  }

  /**
   * How far the held keys move the aim this frame, in goal widths (x, to the right) and goal heights (y, up).
   * Also turns the curl while a keyboard charge is held. Call once per frame.
   */
  keyStep(dt: number): { x: number; y: number } {
    const side = this.axis(LEFT, RIGHT);
    if (this.charging) {
      if (this.shootKey !== null) this.curl = Math.max(-1, Math.min(1, this.curl + side * CURL_SPEED * dt));
      return { x: 0, y: 0 };
    }
    const up = this.axis(DOWN, UP);
    if (side === 0 && up === 0) {
      this.heldFor = 0;
      return { x: 0, y: 0 };
    }
    this.heldFor += dt;
    const ease = AIM_START_SPEED + (1 - AIM_START_SPEED) * Math.min(1, this.heldFor / AIM_EASE_IN);
    const speed = AIM_SPEED * ease * (this.held.has('ShiftLeft') || this.held.has('ShiftRight') ? AIM_FINE : 1);
    return { x: side * speed * dt, y: up * speed * dt };
  }

  private axis(minus: string[], plus: string[]) {
    return (plus.some((k) => this.held.has(k)) ? 1 : 0) - (minus.some((k) => this.held.has(k)) ? 1 : 0);
  }

  private setPointer(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.hasPointer = true;
    this.usingKeys = false;
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

  private keyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const code = e.code;
    if (AIM_KEYS.includes(code) || SHOOT.includes(code)) e.preventDefault(); // no page scrolling
    this.held.add(code);
    if (AIM_KEYS.includes(code) && !this.charging) {
      this.usingKeys = true;
      this.hasPointer = true;
    } else if (SHOOT.includes(code) && !e.repeat && this.enabled && !this.charging) {
      this.usingKeys = true;
      this.hasPointer = true;
      this.shootKey = code;
      this.curl = 0;
      this.charging = true;
      this.onPress();
    } else if (code === 'Escape') {
      this.cancel();
    }
  };

  private keyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    if (this.charging && e.code === this.shootKey) this.finish();
  };

  private blur = () => {
    this.held.clear();
    this.cancel();
  };

  private cancel() {
    if (!this.charging || this.shootKey === null) return;
    this.charging = false;
    this.shootKey = null;
    this.curl = 0;
    this.onCancel();
  }

  private finish() {
    this.charging = false;
    if (this.pointerId !== null && this.el.hasPointerCapture(this.pointerId)) {
      this.el.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.shootKey = null;
    this.onRelease();
  }
}

/** Typing in a text box (like the ?edit settings editor) isn't playing. */
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName ?? ''));
}

import * as THREE from 'three';

const SPIN_SPEED = 0.5; // radians per second while it floats on the intro, about 29 degrees
const SPIN_AXIS = new THREE.Vector3(0.15, 1, 0.36).normalize(); // mostly upright, tipped toward the camera
const FLY_DELAY = 0.15; // seconds the intro's words and buttons get to move away first
const FLY_TIME = 1.0; // seconds from the middle of the screen down onto the penalty spot
const FLY_ARC = 0.3; // metres the ball rises above a straight line halfway along
const SETTLE_FROM = 0.7; // share of the flight after which the spin turns into the ball's resting turn
const BOUNCE_TIME = 0.18; // seconds of the little hop after it touches down
const BOUNCE_HEIGHT = 0.03; // metres
const LIFT_TIME = 0.8; // seconds back up from the spot into the intro (Menu on the end screen)
const STILL_WAIT = 0.3; // with reduced motion: no flight, the ball is just on the spot after this
const REVEAL_DELAY = 0.15; // seconds before the purple starts opening up from the ball
const REVEAL_TIME = 0.75; // seconds for the opening to grow past the corners of the screen

/** Something on screen the ball is drawn in: the intro's empty space between the title and the buttons. */
export interface BallSlot {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

type State = 'off' | 'float' | 'land' | 'lift';

/**
 * The real ball on the intro screen: big and slowly spinning in the space between the title and
 * the buttons, then (on Speel nu) flying in a soft arc down onto the penalty spot with a tiny hop.
 * "Menu" on the end screen lifts it back up. It only moves the ball's mesh; physics keeps its ball
 * on the spot the whole time, so the first shot starts exactly as before.
 */
export class IntroBall {
  private state: State = 'off';
  private time = 0;
  private slot: BallSlot | null = null;
  private onTouch = () => {};
  private onDone = () => {};
  private readonly spin = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly from = new THREE.Vector3();
  private readonly fromQuaternion = new THREE.Quaternion();
  private readonly target = new THREE.Vector3();
  private readonly restQuaternion = new THREE.Quaternion();
  private readonly ray = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private touched = false;

  constructor(
    private readonly ball: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly view: BallSlot,
    private readonly radius: number,
    private readonly reducedMotion = false,
  ) {}

  /** True while it moves the ball (so a shot can't start yet). */
  get active() {
    return this.state !== 'off';
  }

  /**
   * How far the purple intro background has gone (see introBackdrop.ts): 0 all purple while the ball
   * floats, opening up from the ball as it flies down, 1 once it's gone; closing again on the way up.
   */
  get reveal() {
    if (this.state === 'off') return 1;
    if (this.state === 'float') return 0;
    if (this.state === 'lift') return 1 - easeInOutCubic(Math.min(1, this.time / LIFT_TIME));
    if (this.reducedMotion) return Math.min(1, this.time / STILL_WAIT);
    return easeOutCubic(Math.min(1, Math.max(0, this.time - REVEAL_DELAY) / REVEAL_TIME));
  }

  /** True while the ball is on its way down to the spot. */
  get landing() {
    return this.state === 'land';
  }

  /** Shows the ball in `slot`; with `lift`, it first rises there from the penalty spot. */
  float(slot: BallSlot, lift = false) {
    this.slot = slot;
    this.time = 0;
    this.state = lift && !this.reducedMotion ? 'lift' : 'float';
    if (this.state === 'lift') {
      this.from.copy(this.ball.position);
      this.fromQuaternion.copy(this.ball.quaternion);
      this.spin.copy(this.ball.quaternion);
    }
    setShadow(this.ball, this.state === 'lift');
  }

  /** Flies the ball onto the spot. `onTouch` when it touches the grass, `onDone` once it rests there. */
  land(onTouch: () => void, onDone: () => void) {
    if (this.state === 'off' || this.state === 'land') return;
    this.state = 'land';
    this.time = 0;
    this.touched = false;
    this.onTouch = onTouch;
    this.onDone = onDone;
    this.from.copy(this.ball.position);
    this.fromQuaternion.copy(this.ball.quaternion);
    setShadow(this.ball, true); // it grows and sharpens as the ball comes down
  }

  /**
   * Call every frame after physics has put the ball on its spot and the camera has moved, with
   * where physics has the ball (resting on the spot). Moves the ball while the intro needs it.
   */
  update(
    dt: number,
    restPosition: { x: number; y: number; z: number },
    restQuaternion: { x: number; y: number; z: number; w: number },
  ) {
    if (this.state === 'off') return;
    this.time += dt;
    this.restQuaternion.set(restQuaternion.x, restQuaternion.y, restQuaternion.z, restQuaternion.w);
    if (!this.reducedMotion) this.spin.premultiply(this.turn.setFromAxisAngle(SPIN_AXIS, SPIN_SPEED * dt));

    if (this.state === 'float') {
      if (this.slotPosition(this.target)) this.ball.position.copy(this.target);
      this.ball.quaternion.copy(this.spin);
    } else if (this.state === 'lift') {
      const s = easeInOutCubic(Math.min(1, this.time / LIFT_TIME));
      if (!this.slotPosition(this.target)) this.target.copy(this.from);
      flightPoint(this.from, this.target, s, FLY_ARC, this.ball.position);
      this.ball.quaternion.copy(this.spin);
      if (s === 1) this.float(this.slot!);
    } else {
      this.target.set(restPosition.x, restPosition.y, restPosition.z);
      if (this.reducedMotion) {
        if (this.time < STILL_WAIT) return;
        this.ball.position.copy(this.target);
        this.ball.quaternion.copy(this.restQuaternion);
        this.finish();
        return;
      }
      const t = Math.max(0, this.time - FLY_DELAY);
      const s = easeInOutCubic(Math.min(1, t / FLY_TIME));
      if (t < FLY_TIME) {
        flightPoint(this.from, this.target, s, FLY_ARC, this.ball.position);
      } else {
        if (!this.touched) {
          this.touched = true;
          this.onTouch();
        }
        const hop = Math.min(1, (t - FLY_TIME) / BOUNCE_TIME);
        this.ball.position.copy(this.target);
        this.ball.position.y += BOUNCE_HEIGHT * Math.sin(Math.PI * hop);
        if (hop === 1) {
          this.ball.quaternion.copy(this.restQuaternion);
          this.finish();
          return;
        }
      }
      // Keeps spinning on the way down, then settles into exactly how the ball rests on the spot.
      this.ball.quaternion.slerpQuaternions(this.spin, this.restQuaternion, smoothstep(SETTLE_FROM, 1, s));
    }
  }

  private finish() {
    this.state = 'off';
    this.onDone();
  }

  /** Where the ball looks exactly as big as the slot, in the middle of it. False when the slot isn't shown. */
  private slotPosition(out: THREE.Vector3) {
    const r = this.slot?.getBoundingClientRect();
    const v = this.view.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0 || v.height === 0) return false;
    const cx = r.left + r.width / 2 - v.left;
    const cy = r.top + r.height / 2 - v.top;
    this.camera.updateMatrixWorld();
    // The camera's view window may be shifted (cameraSettings verticalShift); unproject knows about that.
    this.ray.set((cx / v.width) * 2 - 1, 1 - (cy / v.height) * 2, 0.5).unproject(this.camera);
    this.ray.sub(this.camera.position).normalize();
    this.camera.getWorldDirection(this.forward);
    const depth = slotDepth(this.radius, Math.min(r.width, r.height), v.height, this.camera.fov);
    out.copy(this.camera.position).addScaledVector(this.ray, depth / this.ray.dot(this.forward));
    return true;
  }
}

/**
 * How far in front of the camera (along its view) a ball of `radius` metres looks `sizePx` across
 * on a view `viewPx` high with a vertical field of view of `fovDeg`.
 */
export function slotDepth(radius: number, sizePx: number, viewPx: number, fovDeg: number) {
  return (radius * viewPx) / (sizePx * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
}

/** A point along the flight: `s` (0..1) of the way from `from` to `to`, raised by an arc of `arc` metres. */
export function flightPoint(from: THREE.Vector3, to: THREE.Vector3, s: number, arc: number, out: THREE.Vector3) {
  out.lerpVectors(from, to, s);
  out.y += arc * 4 * s * (1 - s);
  return out;
}

/** Starts gently, speeds up, and slows down again at the end. */
export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Fast at first, then slowing down. */
export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The floating ball casts no shadow: one high up in front of the camera would look odd on the grass. */
function setShadow(ball: THREE.Object3D, on: boolean) {
  ball.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = on;
  });
}

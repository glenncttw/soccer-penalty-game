import * as THREE from 'three';

const SPIN_SPEED = 0.5; // radians per second while it floats on the intro, about 29 degrees
const SPIN_AXIS = new THREE.Vector3(0.15, 1, 0.36).normalize(); // mostly upright, tipped toward the camera
const FLY_DELAY = 0.15; // seconds the intro's words and button get to move away first
const FLY_TIME = 1.6; // seconds from the middle of the screen down onto the penalty spot, as the camera pulls back
const SWING = 0.3; // how far the ball swings out to each side on the way, as a share of half the view's width
const RISE = 0.15; // and how far it lifts in the middle, as a share of half the view's height
const FLY_TURNS = 2.5; // extra turns the ball spins on the way, slowing down
const FLY_SPIN_AXIS = new THREE.Vector3(1, 0.35, 0.25).normalize(); // topspin with a bit of sidespin
const SETTLE_FROM = 0.75; // share of the flight after which the spin turns into the ball's resting turn
const FLY_ARC = 0.3; // metres the ball rises above a straight line halfway up (Menu)
const LIFT_TIME = 0.8; // seconds back up from the spot into the intro (Menu on the end screen)
const STILL_WAIT = 0.3; // with reduced motion: no flight, the ball is just on the spot after this
const REVEAL_DELAY = 0.15; // seconds before the purple starts opening up from the ball
const REVEAL_TIME = 0.75; // seconds for the opening to grow past the corners of the screen

/** Something on screen the ball is drawn in: the intro's empty space between the title and the buttons. */
export interface BallSlot {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

/** Where the gameplay camera rests (it moves there from close to the goal as the ball comes down). */
export interface CameraRest {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

type State = 'off' | 'float' | 'land' | 'lift';

/**
 * The real ball on the intro screen: big and slowly spinning in the middle of the screen, then (on
 * Speel nu) swooping and spinning down onto the penalty spot while the camera pulls back from close
 * to the goal to where you shoot from; it comes to rest softly, no bounce. "Menu" on the end screen
 * lifts it back up. It only moves the ball's mesh; physics keeps its ball on the spot the whole
 * time, so the first shot starts exactly as before.
 */
export class IntroBall {
  private state: State = 'off';
  private time = 0;
  private slot: BallSlot | null = null;
  private onDone = () => {};
  private readonly spin = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly from = new THREE.Vector3();
  private readonly fromQuaternion = new THREE.Quaternion();
  private readonly target = new THREE.Vector3();
  private readonly restQuaternion = new THREE.Quaternion();
  private readonly ray = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly fromView = new THREE.Vector3(); // where the flight starts, as seen from the camera
  private readonly toView = new THREE.Vector3(); // the spot, as seen from the camera at rest
  private readonly matrix = new THREE.Matrix4();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(
    private readonly ball: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly view: BallSlot,
    private readonly radius: number,
    private readonly cameraRest: CameraRest,
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

  /**
   * How close the camera is to the goal (see gameCamera.ts): 1 close up while the intro shows,
   * pulling back to 0, the normal view, as the ball comes down. 0 with reduced motion.
   */
  get cameraIntro() {
    if (this.reducedMotion || this.state === 'off' || this.state === 'lift') return 0;
    if (this.state === 'float') return 1;
    return 1 - this.flight;
  }

  /** How far along the flight down to the spot is (0..1, eased). */
  private get flight() {
    return easeInOutCubic(Math.min(1, Math.max(0, this.time - FLY_DELAY) / FLY_TIME));
  }

  /** True while the ball is on its way down to the spot. */
  get landing() {
    return this.state === 'land';
  }

  /** True while the ball waits in the middle of the intro. */
  get floating() {
    return this.state === 'float';
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

  /** Flies the ball onto the spot; `onDone` once it rests there. */
  land(onDone: () => void) {
    if (this.state === 'off' || this.state === 'land') return;
    this.state = 'land';
    this.time = 0;
    this.onDone = onDone;
    this.camera.updateMatrixWorld();
    this.fromView.copy(this.ball.position).applyMatrix4(this.camera.matrixWorldInverse);
    this.fromQuaternion.copy(this.ball.quaternion);
    setShadow(this.ball, true); // it grows and sharpens as the ball comes down
  }

  /** Moves time on. Call every frame before the camera moves (it reads `cameraIntro`). */
  advance(dt: number) {
    if (this.state === 'off') return;
    this.time += dt;
    if (!this.reducedMotion) this.spin.premultiply(this.turn.setFromAxisAngle(SPIN_AXIS, SPIN_SPEED * dt));
  }

  /**
   * Call every frame after physics has put the ball on its spot and the camera has moved, with
   * where physics has the ball (resting on the spot). Moves the ball while the intro needs it.
   */
  place(
    restPosition: { x: number; y: number; z: number },
    restQuaternion: { x: number; y: number; z: number; w: number },
  ) {
    if (this.state === 'off') return;
    this.restQuaternion.set(restQuaternion.x, restQuaternion.y, restQuaternion.z, restQuaternion.w);

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
      const s = this.flight;
      if (s === 1) {
        this.ball.position.copy(this.target);
        this.ball.quaternion.copy(this.restQuaternion);
        this.finish();
        return;
      }
      // The flight is worked out as seen from the camera, which is still pulling back past the spot:
      // from the middle of the screen to where the spot will be once the camera is back, swinging
      // out to one side and then the other on the way. Both arrive at the same moment, gently.
      this.matrix.compose(this.cameraRest.position, this.cameraRest.quaternion, this.one).invert();
      this.toView.copy(this.target).applyMatrix4(this.matrix);
      this.camera.updateMatrixWorld();
      const p = this.ball.position.lerpVectors(this.fromView, this.toView, s);
      const halfHeight = -p.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      p.x += SWING * halfHeight * this.camera.aspect * Math.sin(2 * Math.PI * s);
      p.y += RISE * halfHeight * Math.sin(Math.PI * s);
      p.applyMatrix4(this.camera.matrixWorld);
      // Spins faster on the way, slowing down, then settles into exactly how the ball rests on the spot.
      this.turn.setFromAxisAngle(FLY_SPIN_AXIS, FLY_TURNS * 2 * Math.PI * easeOutCubic(s));
      this.spin.copy(this.turn).multiply(this.fromQuaternion);
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

import * as THREE from 'three';

// The ball only ever turns one way: rolling forward round the line across the screen (no tilted or wobbly spin).
const ROLL_AXIS = new THREE.Vector3(1, 0, 0);
const SPIN_SPEED = 0.5; // radians per second it rolls while it floats on the intro, about 29 degrees
const FLY_TIME = 1.6; // seconds from the middle of the screen down onto the penalty spot, as the camera pulls back
const RISE = 0.15; // how far it lifts in the middle of its curve, as a share of half the view's height
// On Speel nu it first swings a little deeper into the tunnel, then back out toward you, then on down.
const SINK_TIME = 0.6; // seconds of its swing into the tunnel (deepest halfway)
const SINK_DEPTH = 0.3; // how much further away it swings, as a share of how far away it floats (about 23% smaller)
const TURN_TIME = SINK_TIME / 2; // when it turns back toward you: the opening, chips and camera go from here
const COME_TIME = 0.9; // seconds of its swing back toward you, from the turn (closest halfway)
const COME_NEAR = 0.3; // how much closer than it floated it comes, as a share of how far away it floats
const FLY_DELAY = 0.15; // seconds before it starts (gently) on its way down, while it still swings in
const FLY_TURNS = 2.5; // at least this many extra turns it rolls on the way, slowing down to rest
const FLY_ARC = 0.3; // metres the ball rises above a straight line halfway up (Menu)
const LIFT_TIME = 0.8; // seconds back up from the spot into the intro (Menu on the end screen)
const STILL_WAIT = 0.3; // with reduced motion: no flight, the ball is just on the spot after this
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
 * The real ball on the intro screen: big and slowly rolling forward in the middle of the screen, then
 * (on Speel nu) first swinging a little deeper into the tunnel, like a wind-up, then back out toward
 * you (as the purple opens up and the chips burst) and down onto the penalty spot, all in one smooth curve, rolling forward, while the camera pulls back from close to the goal to where you
 * shoot from; it comes to rest softly, no bounce. "Menu" on the end screen
 * lifts it back up. It only moves the ball's mesh; physics keeps its ball on the spot the whole
 * time, so the first shot starts exactly as before.
 */
export class IntroBall {
  private state: State = 'off';
  private time = 0;
  private slot: BallSlot | null = null;
  private onDone = () => {};
  private roll = 0; // radians it has rolled forward
  private rollFrom = 0; // at the start of the flight
  private rollTo = 0; // at the end: whole turns, so it lands exactly as it rests
  private readonly turn = new THREE.Quaternion();
  private readonly base = new THREE.Quaternion(); // how it's turned before rolling (as it rests, or as it came up)
  private readonly from = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly restQuaternion = new THREE.Quaternion();
  private readonly ray = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly fromView = new THREE.Vector3(); // where it floated, as seen from the camera
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
    return glide(Math.min(1, this.turned / REVEAL_TIME));
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

  /** Seconds since the ball turned back toward you, out of the tunnel (0 while it still swings in). */
  private get turned() {
    return Math.max(0, this.time - TURN_TIME);
  }

  /**
   * How far along the flight down to the spot is (0..1): what the ball and the camera follow. It starts
   * gently, while the ball still swings into the tunnel, speeds up and slows down softly onto the spot.
   */
  private get flight() {
    return glide(Math.min(1, Math.max(0, this.time - FLY_DELAY) / FLY_TIME));
  }

  /**
   * How much further from the camera than its flight the ball is, as a share of how far away it floated:
   * first deeper into the tunnel, then (without stopping) back out past where it floated, toward you.
   */
  private get swing() {
    return SINK_DEPTH * bump(this.time / SINK_TIME) - COME_NEAR * bump((this.time - TURN_TIME) / COME_TIME);
  }

  /** True while the ball swings into the tunnel on Speel nu, before it turns back toward you. */
  get windingUp() {
    return this.state === 'land' && !this.reducedMotion && this.time < TURN_TIME;
  }

  /** True from Speel nu until the ball rests on the spot (its wind-up included). */
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
    const lifting = lift && !this.reducedMotion;
    if (lifting || this.state === 'off') {
      this.from.copy(this.ball.position);
      this.base.copy(this.ball.quaternion);
      this.roll = 0;
    }
    this.state = lifting ? 'lift' : 'float';
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
    this.rollFrom = this.roll;
    const turn = 2 * Math.PI;
    this.rollTo = this.reducedMotion ? this.roll : Math.ceil((this.rollFrom + FLY_TURNS * turn) / turn) * turn;
    setShadow(this.ball, true); // it grows and sharpens as the ball comes down
  }

  /** Moves time on. Call every frame before the camera moves (it reads `cameraIntro`). */
  advance(dt: number) {
    if (this.state === 'off') return;
    this.time += dt;
    if (!this.reducedMotion && this.state !== 'land') this.roll += SPIN_SPEED * dt;
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
      this.rolled(this.base);
    } else if (this.state === 'lift') {
      const s = easeInOutCubic(Math.min(1, this.time / LIFT_TIME));
      if (!this.slotPosition(this.target)) this.target.copy(this.from);
      flightPoint(this.from, this.target, s, FLY_ARC, this.ball.position);
      this.rolled(this.base);
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
      if (this.flight === 1) {
        this.ball.position.copy(this.target);
        this.ball.quaternion.copy(this.restQuaternion);
        this.finish();
        return;
      }
      // The flight is worked out as seen from the camera, which is still pulling back past the spot:
      // from the middle of the screen to where the spot will be once the camera is back, in one smooth
      // curve. Both arrive at the same moment, gently. Its distance from the camera has its own curve:
      // first a little deeper into the tunnel, then back out toward you, and only then far off to the
      // spot (sliding it along its line from the camera keeps it in the same place on screen).
      this.matrix.compose(this.cameraRest.position, this.cameraRest.quaternion, this.one).invert();
      this.toView.copy(this.target).applyMatrix4(this.matrix);
      this.camera.updateMatrixWorld();
      const s = this.flight;
      const p = this.ball.position.lerpVectors(this.fromView, this.toView, s);
      const near = -this.fromView.z;
      const far = -this.toView.z;
      p.multiplyScalar((near * (1 + this.swing) + (far - near) * s ** 3) / -p.z);
      const halfHeight = -p.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      p.y += RISE * halfHeight * Math.sin(Math.PI * s);
      p.applyMatrix4(this.camera.matrixWorld);
      // Rolls forward faster on the way, slowing down with the flight, and stops after whole turns: so
      // it ends up exactly as it rests on the spot, without ever turning another way. It carries on
      // with its floating spin at first, which fades out as the flight takes over.
      const spin = SPIN_SPEED * this.time * (1 - s);
      this.roll = this.rollFrom + spin + (this.rollTo - this.rollFrom) * s;
      this.rolled(this.turn.slerpQuaternions(this.base, this.restQuaternion, s));
    }
  }

  /** Turns the ball to `base` rolled forward by `roll`. */
  private rolled(base: THREE.Quaternion) {
    this.ball.quaternion.setFromAxisAngle(ROLL_AXIS, this.roll).multiply(base);
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

/** 0 outside 0..1, rising smoothly to 1 halfway and smoothly back down. */
function bump(t: number) {
  return t > 0 && t < 1 ? Math.sin(Math.PI * t) ** 2 : 0;
}

/** Starts gently, is quickest a third of the way along, and slows down softly into the end. */
function glide(t: number) {
  return 1 - (1 - t) ** 3 * (1 + 3 * t);
}

/** The floating ball casts no shadow: one high up in front of the camera would look odd on the grass. */
function setShadow(ball: THREE.Object3D, on: boolean) {
  ball.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = on;
  });
}

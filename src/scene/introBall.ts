import * as THREE from 'three';

// The ball only ever turns one way: rolling forward round the line across the screen (no tilted or wobbly spin).
const ROLL_AXIS = new THREE.Vector3(1, 0, 0);
const ORIGIN = new THREE.Vector3();
const SPIN_SPEED = 0.75; // radians per second it rolls while it floats on the intro, about 43 degrees
const FLY_TIME = 2.0; // seconds from the middle of the screen down onto the penalty spot, as the camera pulls back
const RISE = 0.15; // how far it lifts in the middle of its curve, as a share of half the view's height
// On Speel nu it first swings a little deeper into the tunnel, then back out toward you, then on down.
const SINK_TIME = 0.75; // seconds of its swing into the tunnel (deepest halfway)
const SINK_DEPTH = 0.5; // how much further away it swings, as a share of how far away it floats (a third smaller)
const TURN_TIME = SINK_TIME / 2; // when it turns back toward you: the opening, chips and camera go from here
const COME_TIME = 1.1; // seconds of its swing back toward you, from the turn (closest halfway)
const COME_NEAR = 0.3; // how much closer than it floated it comes, as a share of how far away it floats
const FLY_DELAY = 0.2; // seconds before it starts (gently) on its way down, while it still swings in
const FLY_TURNS = 2.5; // at least this many extra turns it rolls on the way, slowing down to rest
const FLY_ARC = 0.3; // metres the ball rises above a straight line halfway up (Menu)
const LIFT_TIME = 0.8; // seconds back up from the spot into the intro (Menu on the end screen)
const STILL_WAIT = 0.3; // with reduced motion: no flight, the ball is just on the spot after this
const REVEAL_TIME = 0.9; // seconds for the opening to grow past the corners of the screen
// While it floats it drifts slowly deeper into the tunnel and back toward you, and follows the mouse a little.
const DRIFT_DEPTH = 0.1; // how much further away (and closer) it drifts, as a share of how far away it floats
const DRIFT_TIME = 3.5; // seconds for one drift in and back out
const DRIFT_START = 2.5; // seconds for the drift to grow in, so it never starts with a jerk
const FOLLOW_X = 0.2; // how far it moves toward the mouse at the side of the screen, as a share of its size (64 px at 1440 x 800)
const FOLLOW_Y = 0.12; // and at the top or bottom (38 px)
const FOLLOW_SPEED = 4.5; // how quickly it catches up with the mouse (per second): calm, never twitchy
// Clicking the ball: it squashes and stretches like a rubber ball, springs a little toward you and spins on.
const BOUNCE_SQUASH = 0.16; // how much flatter it gets at first (and then taller, less and less)
const BOUNCE_WOBBLES = 2.4; // squash-and-stretch wobbles a second
const BOUNCE_DAMP = 5.5; // how quickly the wobble dies down (per second)
const BOUNCE_NEAR = 0.12; // how much closer it springs (a share of its distance)
const BOUNCE_SPIN = 7.5; // radians a second of extra roll at the start, dying down (about 0.4 turn in all)
const BOUNCE_TIME = 1.2; // seconds after which it's still again
// Speel nu pressed before the game is in: the ball waits at the deepest point of its wind-up, spinning faster and
// faster (a bigger wind-up), and sets off once the game is in.
const HOLD_SPIN = 3; // radians a second faster it rolls every second it waits
const HOLD_SPIN_MOST = 12; // radians a second at most (about 2 turns)
// The first time the intro shows (after loading): the ball flies out of the depth of the tunnel into place.
const ENTER_DELAY = 0.15; // seconds before it sets off
const ENTER_TIME = 0.8; // seconds of its flight
const ENTER_DEPTH = 3; // how much further away it starts, as a share of how far away it floats
const ENTER_SPIN = 8; // how much faster it rolls as it sets off, slowing down to its floating spin

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
  private floatTime = 0; // seconds it has floated in the slot (for its drift)
  private readonly pointer = { x: 0, y: 0 }; // where the mouse is, -1..1 from the middle of the screen
  /** How far it follows the mouse, smoothed: -1..1 across and down. */
  readonly lean = { x: 0, y: 0 };
  /**
   * Where the tunnel and its chips are centred: where the ball floats without its drift and without following
   * the mouse (so the ball moves in the tunnel, not the tunnel with it), then with the ball once it flies.
   */
  readonly home = new THREE.Vector3();
  private readonly homeOffset = new THREE.Vector3(); // from the ball to its home as Speel nu is pressed
  private bounceTime = Infinity; // seconds since the ball was clicked
  private enterTime = Infinity; // seconds since the intro first showed (its fly-in)
  /** How much wider (x) and taller (y) the ball looks while it bounces: 1, 1 when it's round. */
  readonly squash = { x: 1, y: 1 };
  private readonly squashed = new THREE.Matrix4();
  private readonly part = new THREE.Matrix4();
  private readonly cameraTurn = new THREE.Quaternion();
  private rollFrom = 0; // at the start of the flight
  private rollTo = 0; // at the end: whole turns, so it lands exactly as it rests
  private holding = false; // waiting in its wind-up for the game (see `hold`)
  private heldRoll = 0; // radians it rolled while waiting
  private heldSpin = 0; // radians a second it rolls while waiting
  private extraRoll = 0; // radians more it rolls on the way after waiting, so it still lands exactly as it rests
  private extraFrom = 0; // how far along the flight was when it set off
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

  /** True while the ball swings into the tunnel on Speel nu (or waits there), before it turns back toward you. */
  get windingUp() {
    return this.state === 'land' && !this.reducedMotion && (this.time < TURN_TIME || this.holding);
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
  float(slot: BallSlot, lift = false, enter = false) {
    this.slot = slot;
    this.time = 0;
    const lifting = lift && !this.reducedMotion;
    if (lifting || this.state === 'off') {
      this.from.copy(this.ball.position);
      this.base.copy(this.ball.quaternion);
      this.roll = 0;
    }
    this.state = lifting ? 'lift' : 'float';
    this.floatTime = 0;
    this.enterTime = enter && !this.reducedMotion ? 0 : Infinity;
    setShadow(this.ball, this.state === 'lift');
  }

  /** Where the mouse is (-1..1 across and down from the middle of the screen); 0, 0 when it's gone. */
  pointAt(x: number, y: number) {
    this.pointer.x = THREE.MathUtils.clamp(x, -1, 1);
    this.pointer.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  /** True while the ball can be clicked to bounce: floating, after its fly-in. */
  get bouncy() {
    return this.state === 'float' && !this.reducedMotion && this.enterTime >= ENTER_DELAY + ENTER_TIME;
  }

  /** The ball was clicked: it bounces (again, if it still was: from where it is, with no jump). */
  bounce() {
    if (!this.bouncy) return;
    this.bounceTime = 0;
  }

  /**
   * Flies the ball onto the spot; `onDone` once it rests there. With `hold` it waits at the deepest point of its
   * wind-up, spinning faster and faster, until `go`.
   */
  land(onDone: () => void, hold = false) {
    if (this.state === 'off' || this.state === 'land') return;
    this.state = 'land';
    this.time = 0;
    this.holding = hold;
    this.heldRoll = 0;
    this.heldSpin = SPIN_SPEED; // on from its floating spin
    this.extraRoll = 0;
    this.onDone = onDone;
    this.camera.updateMatrixWorld();
    this.fromView.copy(this.ball.position).applyMatrix4(this.camera.matrixWorldInverse);
    this.homeOffset.subVectors(this.home, this.ball.position);
    this.rollFrom = this.roll;
    const turn = 2 * Math.PI;
    this.rollTo = this.reducedMotion ? this.roll : Math.ceil((this.rollFrom + FLY_TURNS * turn) / turn) * turn;
    setShadow(this.ball, true); // it grows and sharpens as the ball comes down
  }

  /** The ball waiting in its wind-up (see `land`) sets off. */
  go() {
    if (!this.holding) return;
    this.holding = false;
    // The turns it rolled while waiting, rounded up to whole turns on the way down.
    const turn = 2 * Math.PI;
    const rolled = this.rollTo + this.heldRoll;
    this.extraRoll = Math.ceil(rolled / turn - 1e-9) * turn - rolled;
    this.extraFrom = this.flight;
  }

  /** Moves time on. Call every frame before the camera moves (it reads `cameraIntro`). */
  advance(dt: number) {
    if (this.state === 'off') return;
    const holdAt = this.reducedMotion ? 0 : TURN_TIME;
    if (this.state === 'land' && this.holding && this.time + dt >= holdAt) {
      this.time = holdAt;
      if (!this.reducedMotion) {
        this.heldSpin = Math.min(HOLD_SPIN_MOST, this.heldSpin + HOLD_SPIN * dt);
        this.heldRoll += this.heldSpin * dt;
      }
      return;
    }
    this.time += dt;
    if (this.state === 'float') this.floatTime += dt;
    this.bounceTime += dt;
    if (this.state === 'float') this.enterTime += dt;
    if (!this.reducedMotion && this.state !== 'land') this.roll += SPIN_SPEED * dt;
    // Rolling fast as it flies in, and a spin on when it's clicked.
    const entered = Math.min(1, Math.max(0, this.enterTime - ENTER_DELAY) / ENTER_TIME);
    if (this.state === 'float') this.roll += ENTER_SPIN * (1 - entered) ** 2 * dt;
    if (this.bounceTime < BOUNCE_TIME) this.roll += BOUNCE_SPIN * Math.exp(-3 * this.bounceTime) * dt;
    // It only follows the mouse while it floats; on Speel nu it eases back to the middle.
    const follow = this.state === 'float' && !this.reducedMotion;
    const k = 1 - Math.exp(-FOLLOW_SPEED * dt);
    this.lean.x += ((follow ? this.pointer.x : 0) - this.lean.x) * k;
    this.lean.y += ((follow ? this.pointer.y : 0) - this.lean.y) * k;
  }

  /**
   * Where the floating ball is moved from the middle of its slot: x and y in pixels toward the mouse, and
   * `away` how much further from the camera it is (a share of its distance: deeper into the tunnel, or closer).
   */
  private offset(size: number) {
    if (this.reducedMotion || this.state !== 'float') return { x: 0, y: 0, away: 0 };
    const grow = THREE.MathUtils.smoothstep(this.floatTime, 0, DRIFT_START);
    let away = DRIFT_DEPTH * grow * Math.sin((2 * Math.PI * this.floatTime) / DRIFT_TIME);
    // Flying in from deep in the tunnel, slowing down softly into its place.
    const entered = Math.min(1, Math.max(0, this.enterTime - ENTER_DELAY) / ENTER_TIME);
    away += ENTER_DEPTH * (1 - entered) ** 3;
    // Clicked: it springs toward you and back.
    if (this.bounceTime < BOUNCE_TIME) away -= BOUNCE_NEAR * wobble(this.bounceTime, BOUNCE_WOBBLES * 0.6);
    return { x: size * FOLLOW_X * this.lean.x, y: size * FOLLOW_Y * this.lean.y, away };
  }

  /**
   * Call every frame after physics has put the ball on its spot and the camera has moved, with
   * where physics has the ball (resting on the spot). Moves the ball while the intro needs it.
   */
  place(
    restPosition: { x: number; y: number; z: number },
    restQuaternion: { x: number; y: number; z: number; w: number },
  ) {
    this.placeBall(restPosition, restQuaternion);
    this.squashBall();
  }

  /**
   * While it bounces the ball squashes and stretches up and down the screen (whichever way it's rolled): its
   * matrix is worked out here, with the squash along the camera's up and down.
   */
  private squashBall() {
    const bouncing = this.state !== 'off' && this.bounceTime < BOUNCE_TIME;
    const flat = bouncing ? BOUNCE_SQUASH * wobble(this.bounceTime, BOUNCE_WOBBLES) : 0;
    this.squash.y = 1 - flat;
    this.squash.x = 1 / Math.sqrt(this.squash.y); // as much wider as it is flatter: it keeps its size
    if (!bouncing) {
      this.ball.matrixAutoUpdate = true;
      return;
    }
    const b = this.ball;
    this.camera.updateMatrixWorld();
    // Turned and sized as usual, then turned to how the camera sees it, squashed, and turned back.
    this.camera.getWorldQuaternion(this.cameraTurn);
    this.squashed.compose(ORIGIN, b.quaternion, b.scale);
    this.squashed.premultiply(this.part.makeRotationFromQuaternion(this.cameraTurn.invert()));
    this.squashed.premultiply(this.part.makeScale(this.squash.x, this.squash.y, this.squash.x));
    this.squashed.premultiply(this.part.makeRotationFromQuaternion(this.cameraTurn.invert())); // back again
    this.squashed.setPosition(b.position);
    b.matrixAutoUpdate = false;
    b.matrix.copy(this.squashed);
    b.matrixWorldNeedsUpdate = true;
  }

  private placeBall(
    restPosition: { x: number; y: number; z: number },
    restQuaternion: { x: number; y: number; z: number; w: number },
  ) {
    if (this.state === 'off') return;
    this.restQuaternion.set(restQuaternion.x, restQuaternion.y, restQuaternion.z, restQuaternion.w);

    if (this.state === 'float') {
      if (this.slotPosition(this.target)) this.ball.position.copy(this.target);
      if (!this.slotPosition(this.home, false)) this.home.copy(this.ball.position);
      this.rolled(this.base);
    } else if (this.state === 'lift') {
      const s = easeInOutCubic(Math.min(1, this.time / LIFT_TIME));
      if (!this.slotPosition(this.target)) this.target.copy(this.from);
      flightPoint(this.from, this.target, s, FLY_ARC, this.ball.position);
      this.rolled(this.base);
      this.home.copy(this.ball.position);
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
      // The tunnel goes over to the ball while it swings in.
      const settle = 1 - THREE.MathUtils.smoothstep(this.time, 0, TURN_TIME);
      this.home.copy(p).addScaledVector(this.homeOffset, settle);
      // Rolls forward faster on the way, slowing down with the flight, and stops after whole turns: so
      // it ends up exactly as it rests on the spot, without ever turning another way. It carries on
      // with its floating spin at first, which fades out as the flight takes over.
      const spin = SPIN_SPEED * this.time * (1 - s);
      const extra = this.extraRoll * Math.max(0, (s - this.extraFrom) / (1 - this.extraFrom));
      this.roll = this.rollFrom + this.heldRoll + spin + (this.rollTo - this.rollFrom) * s + extra;
      this.rolled(this.turn.slerpQuaternions(this.base, this.restQuaternion, s));
    }
  }

  /** Turns the ball to `base` rolled forward by `roll`. */
  private rolled(base: THREE.Quaternion) {
    this.ball.quaternion.setFromAxisAngle(ROLL_AXIS, this.roll).multiply(base);
  }

  private finish() {
    this.state = 'off';
    this.bounceTime = Infinity;
    this.onDone();
  }

  /**
   * Where the ball looks exactly as big as the slot, in the middle of it (`moved`: with its drift and following
   * the mouse). False when the slot isn't shown.
   */
  private slotPosition(out: THREE.Vector3, moved = true) {
    const r = this.slot?.getBoundingClientRect();
    const v = this.view.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0 || v.height === 0) return false;
    const size = Math.min(r.width, r.height);
    const shift = moved ? this.offset(size) : { x: 0, y: 0, away: 0 };
    const cx = r.left + r.width / 2 - v.left + shift.x;
    const cy = r.top + r.height / 2 - v.top + shift.y;
    this.camera.updateMatrixWorld();
    // The camera's view window may be shifted (cameraSettings verticalShift); unproject knows about that.
    this.ray.set((cx / v.width) * 2 - 1, 1 - (cy / v.height) * 2, 0.5).unproject(this.camera);
    this.ray.sub(this.camera.position).normalize();
    this.camera.getWorldDirection(this.forward);
    const depth = slotDepth(this.radius, size, v.height, this.camera.fov) * (1 + shift.away);
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

/**
 * A spring let go at `t` = 0 seconds: 0 at first, out to about 1, then back past 0 the other way, less and
 * less, `perSecond` times a second, until it's still.
 */
function wobble(t: number, perSecond: number) {
  return Math.exp(-BOUNCE_DAMP * t) * Math.sin(2 * Math.PI * perSecond * t) * 1.6;
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

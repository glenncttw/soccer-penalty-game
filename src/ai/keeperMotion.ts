import type { Vec3 } from '../physics/ballForces';
import { KEEPER_BODY, toBody, toWorld, type KeeperPose } from '../physics/keeperBody';
import type { KeeperSkill, ShotRead } from './keeper';

// Ready stance: gloves out to the sides at waist height, a little in front.
const READY_GLOVES: [Vec3, Vec3] = [
  { x: -0.46, y: 0.78, z: 0.16 },
  { x: 0.46, y: 0.78, z: 0.16 },
];
const STAND_REACH = 0.85; // balls this close (sideways) are reached without diving
const MAX_TILT = 1.4; // radians: nearly flat out
const MAX_JUMP = 0.45; // metres the feet can leave the ground
const GLOVE_GAP = 0.12; // half the space between the gloves when reaching
const DIVE_FORWARD = 0.12; // metres a dive carries it off its line toward the ball
const HOLD_TIME = 0.1; // seconds it hangs at full stretch
// A keeper that guesses goes all-in as the ball is struck (in real life it is already moving),
// so it gets across this much faster than one that waits to read the shot.
const GUESS_BOOST = 1.5;
const LAND_TIME = 0.4; // seconds from full stretch to lying on the grass
const RECOVER_TIME = 0.45; // seconds to get back up and into the middle

interface Move {
  from: Vec3;
  to: Vec3;
  tilt: number;
  gloves: [Vec3, Vec3];
  crouch: number;
  /** Extra height at the middle of the move, for a springy dive. */
  hop: number;
  /** True if it ends up lying on the grass. */
  lands: boolean;
  delay: number;
  duration: number;
}

/**
 * How the keeper moves. Before the kick it bounces on its toes and edges toward
 * where the player aims, and gets set while the shot is charged. When the ball
 * is struck it waits for its reaction time (or longer for a slow ball, so it
 * gets there with it), then steps, stretches or dives at the spot it read, as
 * fast as its skill allows, and lands on the grass.
 */
export class KeeperMotion {
  readonly pose: KeeperPose;
  /** Where the player aims (x on the goal), or null if unknown. */
  aimX: number | null = null;
  /** True while the player charges a shot. */
  set = false;
  /** The spot it went for after the last kick, or null. */
  wentFor: { x: number; y: number } | null = null;
  /** True if it guessed instead of reading the last shot. */
  guessed = false;
  private time = 0;
  private move: Move | null = null;
  private recovery: { from: KeeperPose; t: number } | null = null;
  private since = 0;
  private startCrouch = 0;

  constructor(
    private readonly home: Vec3,
    public skill: KeeperSkill,
  ) {
    this.pose = { pivot: { ...home }, tilt: 0, gloves: [{ ...READY_GLOVES[0] }, { ...READY_GLOVES[1] }], crouch: 0 };
  }

  /** Back to the middle of the goal, standing, at once. */
  reset() {
    this.move = null;
    this.recovery = null;
    this.wentFor = null;
    Object.assign(this.pose.pivot, this.home);
    this.pose.tilt = 0;
    this.pose.crouch = 0;
    copyGloves(this.pose.gloves, READY_GLOVES);
  }

  /** Gets up and walks back to the middle over a moment, ready for the next shot. */
  recover() {
    const p = this.pose;
    this.recovery = {
      from: { pivot: { ...p.pivot }, tilt: p.tilt, gloves: [{ ...p.gloves[0] }, { ...p.gloves[1] }], crouch: p.crouch },
      t: 0,
    };
    this.move = null;
    this.wentFor = null;
  }

  /** True from the kick until it recovers or is reset. */
  get moving() {
    return this.move !== null;
  }

  /** The line (z) where its gloves meet the ball. */
  get lineZ() {
    return this.home.z + DIVE_FORWARD + 0.1;
  }

  /**
   * Reacts to the kick. It moves after its reaction time, or later for a slow
   * ball so it gets there with it (watching the ball longer); a keeper that
   * guessed goes at once.
   */
  react(read: ShotRead) {
    this.recovery = null;
    let delay = read.read ? this.skill.reaction : 0;
    let spot = read.spot(delay);
    let move = this.plan(spot, delay, read.read ? 1 : GUESS_BOOST);
    if (read.read && read.time - move.duration > delay) {
      delay = read.time - move.duration;
      spot = read.spot(delay);
      move = this.plan(spot, delay, 1);
    }
    this.move = move;
    this.wentFor = spot;
    this.guessed = !read.read;
    this.since = 0;
    this.startCrouch = this.pose.crouch;
  }

  /** The step, stretch or dive that gets its gloves to `spot`, starting `delay` seconds after the kick. */
  private plan(spot: { x: number; y: number }, delay: number, boost: number): Move {
    const ground = this.home.y;
    const from = { x: this.pose.pivot.x, y: ground, z: this.pose.pivot.z };
    const target = { x: spot.x, y: spot.y, z: from.z + DIVE_FORWARD };
    const dx = target.x - from.x;
    const height = target.y - ground;
    const skill = this.skill;
    let move: Omit<Move, 'gloves' | 'delay' | 'duration'>;

    if (Math.abs(dx) < STAND_REACH && height < 1.75) {
      // Within reach: a quick step and a stretch, getting low for low balls.
      const step = clamp(dx * 0.5, -0.3, 0.3);
      move = {
        from,
        to: { x: from.x + step, y: ground, z: from.z },
        tilt: height < 0.5 ? 0 : clamp(dx * 0.35, -0.3, 0.3),
        crouch: height < 0.5 ? 1 : 0,
        hop: 0,
        lands: false,
      };
    } else {
      // A dive (or a jump for a high ball): lay the body out toward the ball.
      const tilt = clamp(Math.atan2(dx, Math.max(0.1, height - 0.1)), -MAX_TILT, MAX_TILT);
      const reach = KEEPER_BODY.shoulder.y + KEEPER_BODY.arm.length;
      const lowest = ground + lowestPivot(tilt);
      let x = target.x - reach * Math.sin(tilt);
      let y = target.y - reach * Math.cos(tilt);
      // Never away from the ball, never into the grass, and only so high.
      x = dx > 0 ? clamp(x, from.x, target.x) : clamp(x, target.x, from.x);
      y = clamp(y, lowest, ground + MAX_JUMP);
      // The lunge decides how far it gets.
      const d = Math.hypot(x - from.x, y - from.y);
      if (d > skill.lunge) {
        x = from.x + ((x - from.x) * skill.lunge) / d;
        y = Math.max(lowest, from.y + ((y - from.y) * skill.lunge) / d);
      }
      move = { from, to: { x, y, z: target.z }, tilt, crouch: 0, hop: 0.12, lands: Math.abs(tilt) > 0.5 };
    }

    // How long it takes depends on how far the gloves have to travel.
    const ready = READY_GLOVES.map((g) => toWorld(this.pose, g));
    const travel = Math.min(...ready.map((g) => Math.hypot(target.x - g.x, target.y - g.y)));
    const duration = 0.1 + travel / (skill.diveSpeed * boost);
    return { ...move, gloves: reachFor(target, move.to, move.tilt), delay, duration };
  }

  /** Advances the keeper by `dt` seconds. */
  step(dt: number) {
    this.time += dt;
    const pose = this.pose;
    const r = this.recovery;
    if (r) {
      r.t += dt;
      const k = smoothstep(Math.min(1, r.t / RECOVER_TIME));
      lerpPoint(pose.pivot, r.from.pivot, this.home, k);
      pose.tilt = lerp(r.from.tilt, 0, k);
      pose.crouch = lerp(r.from.crouch, 0, k);
      for (const i of [0, 1] as const) lerpPoint(pose.gloves[i], r.from.gloves[i], READY_GLOVES[i], k);
      if (k >= 1) this.recovery = null;
      return;
    }
    const m = this.move;
    if (!m) {
      // Waiting: bounce on the toes and edge toward the aim, or get set while the shot charges.
      const lean = this.aimX === null ? 0 : clamp(this.aimX * this.skill.lean, -0.6, 0.6);
      pose.pivot.x = damp(pose.pivot.x, this.home.x + lean, 3, dt);
      const bounce = this.set ? 0 : 0.03 * Math.abs(Math.sin(this.time * 4.2));
      pose.pivot.y = damp(pose.pivot.y, this.home.y + bounce, 20, dt);
      pose.crouch = damp(pose.crouch, this.set ? 0.35 : 0, 8, dt);
      const wiggle = this.set ? 0 : 0.04 * Math.sin(this.time * 2.3);
      pose.gloves[0].y = READY_GLOVES[0].y + wiggle;
      pose.gloves[1].y = READY_GLOVES[1].y - wiggle;
      return;
    }

    this.since += dt;
    const u = clamp((this.since - m.delay) / m.duration, 0, 1);
    const k = 1 - (1 - u) ** 2; // explosive start, gentle finish
    pose.pivot.x = lerp(m.from.x, m.to.x, k);
    pose.pivot.y = lerp(m.from.y, m.to.y, k) + m.hop * 4 * k * (1 - k);
    pose.pivot.z = lerp(m.from.z, m.to.z, k);
    pose.tilt = m.tilt * k;
    pose.crouch = lerp(this.startCrouch, m.crouch, k);
    const arms = 1 - (1 - Math.min(1, u * 1.4)) ** 2; // the arms get there a little first
    for (const i of [0, 1] as const) lerpPoint(pose.gloves[i], READY_GLOVES[i], m.gloves[i], arms);

    const after = this.since - m.delay - m.duration - HOLD_TIME;
    if (after > 0) {
      // Coming down: dives end on the grass, steps and jumps back on the feet.
      const l = Math.min(1, after / LAND_TIME);
      const fall = l * l;
      if (m.lands) {
        const tilt = Math.sign(m.tilt) * Math.max(Math.abs(m.tilt), 1.35);
        pose.tilt = lerp(m.tilt, tilt, l);
        pose.pivot.y = lerp(m.to.y, this.home.y + lowestPivot(tilt), fall);
      } else {
        pose.tilt = lerp(m.tilt, 0, l);
        pose.pivot.y = lerp(m.to.y, this.home.y, fall);
        pose.crouch = lerp(m.crouch, 0, l);
      }
    }
  }
}

/** Lowest the feet can be when leaning by `tilt`, so no part of the body sinks into the grass. */
export function lowestPivot(tilt: number): number {
  const b = KEEPER_BODY;
  const c = Math.cos(tilt);
  const s = Math.abs(Math.sin(tilt));
  const torso = b.torso.radius - b.torso.bottom * c;
  const leg = b.legs.x * s + b.legs.radius - b.legs.bottom * c;
  return Math.max(0, torso, leg);
}

/** Glove positions (in the body's frame) reaching for `target`, as far as the arms allow. */
function reachFor(target: Vec3, pivot: Vec3, tilt: number): [Vec3, Vec3] {
  const t = toBody(pivot, tilt, target);
  const s = KEEPER_BODY.shoulder;
  return [-1, 1].map((side) => {
    const shoulder = { x: side * s.x, y: s.y, z: 0 };
    const want = { x: t.x + side * GLOVE_GAP - shoulder.x, y: t.y - shoulder.y, z: 0.1 };
    const length = Math.hypot(want.x, want.y, want.z);
    const k = length > KEEPER_BODY.arm.length ? KEEPER_BODY.arm.length / length : 1;
    return { x: shoulder.x + want.x * k, y: shoulder.y + want.y * k, z: want.z * k };
  }) as [Vec3, Vec3];
}

function copyGloves(to: [Vec3, Vec3], from: [Vec3, Vec3]) {
  Object.assign(to[0], from[0]);
  Object.assign(to[1], from[1]);
}

function lerpPoint(out: Vec3, a: Vec3, b: Vec3, t: number) {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function damp(x: number, target: number, rate: number, dt: number) {
  return lerp(x, target, 1 - Math.exp(-rate * dt));
}

function clamp(x: number, min: number, max: number) {
  return Math.min(max, Math.max(min, x));
}

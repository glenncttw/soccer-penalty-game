import type { Vec3 } from '../physics/ballForces';
import { holdSpot, type ClipSample, type KeeperClip, type KeeperRig } from '../scene/keeperRig';
import type { KeeperSkill, ShotRead } from './keeper';

const MAX_SHIFT = 0.6; // metres it edges off the middle at most while you aim
const FOLLOW = 6; // how briskly it follows your aim (a spring: speeds up, then slows down to stop on the spot)
const MAX_STEP = 2; // fastest side-stepping, as a share of the speed the shuffle was made for
const STEP_BLEND = 0.1; // seconds the side steps take to blend in and out as it speeds up and slows down
const BLEND = 0.3; // seconds between idle, ready and celebrating
const SAVE_BLEND = 0.15; // seconds into a save from the ready stance
const SAVE_BLEND_IDLE = 0.2; // the same from idle, which is further from where the saves start
const SPEED_EASE = 0.15; // seconds a sped-up save takes to ease back to its own speed after full stretch
const CARRY = 0.08; // seconds its side-step speed carries on into a save
const STAND_REACH = 0.55; // balls this close to its middle (sideways) are caught, punched or jumped over
const TUCK_HEIGHT = 1.05; // metres: a ball at it this high is jumped at (tuck jump)
const HIGH_DIVE = 0.9; // metres: a ball this high to the side gets a high dive, lower ones a low dive
const PUNCH_SPEED = 24; // m/s: harder shots at it are punched away, softer ones caught
const STEP_SLIDE = 0.25; // metres it shifts across in a standing save
const STAND_LIFT: [number, number] = [0, 0.1]; // metres higher it can stretch in a catch or punch
const DIVE_LIFT: [number, number] = [-0.15, 0.3]; // metres a dive can be lower or higher than in Blender
const JUMP_LIFT: [number, number] = [-0.3, 0.25]; // the same for the tuck jump
const HANDS_CLOSED = 0.2; // seconds into catch_chest its hands have closed enough to hold the ball
const CATCH_READY = 0.12; // seconds into catch_chest it can take the ball (the hands still closing round it)
/**
 * How fast each save plays as a rule, compared with Blender: the clips are timed calmly, and next
 * to a 25 m/s ball they look like slow motion at their own speed. It can go up to `speedUp` times
 * faster still to get there in time.
 */
const PACE: Partial<Record<KeeperClip, number>> = {
  dive_low_L: 1.5,
  dive_low_R: 1.5,
  dive_high_L: 1.5,
  dive_high_R: 1.5,
  tuck_jump: 1.3,
  punch: 1.3,
  catch_chest: 1.2,
};
const SLOWEST = 0.8; // share of its pace a save can slow down to for a slow ball, before it starts later instead
const GLOVE_LINE = 0.5; // metres in front of where it stands that its gloves meet the ball

/** A save: which animation, how fast, and how far the whole keeper is shifted to get its gloves there. */
interface Save {
  clip: KeeperClip;
  /** Seconds after the kick it starts. */
  start: number;
  /** Seconds into the clip its gloves are where the ball will be. */
  at: number;
  /** How fast the clip plays up to `at` (1 = as made in Blender). */
  speed: number;
  /** How fast it plays after `at` (its PACE). */
  pace: number;
  /** Seconds into the clip it lands: the lift is back to 0 by then. */
  land: number;
  slide: number;
  lift: number;
  /** How far (m) its gloves still are from the ball's path. */
  miss: number;
}

/**
 * How the keeper moves, using the animations Glenn made for it in Blender. Before the kick it
 * stands at ease (idle), gets ready while you aim and side-steps (shuffle) toward where you aim.
 * When the ball is struck it waits for its reaction time (or longer for a slow ball), then plays
 * the save that fits where it thinks the ball goes: a catch or a punch for a ball at it, a tuck
 * jump for one over its head, and a low or high dive to either side. The save is sped up to get
 * there in time (as far as its skill allows), and the whole keeper shifts a little across and up
 * so its gloves meet the ball. After the last penalty it celebrates.
 */
export class KeeperMotion {
  /** Where the player aims (x on the goal), or null if they aren't aiming. */
  aimX: number | null = null;
  /** True while the player aims or charges a shot: it gets ready (and stands at ease otherwise). */
  ready = false;
  /** The spot it went for after the last kick, or null. */
  wentFor: { x: number; y: number } | null = null;
  /** True if it guessed instead of reading the last shot. */
  guessed = false;
  /** Where it stands: the point between its feet (moved by side steps and saves). */
  private readonly at: Vec3;
  private save: Save | null = null;
  private saveFrom = 0; // where it stood (x) when it went for the ball
  private carry = 0; // its side-step speed (m/s) at the kick, carried on a moment into the save
  private velocity = 0; // its side-step speed (m/s) while waiting
  private readiness = 0; // 0 at ease .. 1 ready, eased so the arms come up (and go down) gently
  private since = 0; // seconds since the kick
  private celebrating = false;

  constructor(
    private readonly home: Vec3,
    public skill: KeeperSkill,
    readonly rig: KeeperRig,
  ) {
    this.at = { ...home };
    this.reset();
  }

  /** Back to standing in the middle of the goal, at ease, at once. */
  reset() {
    this.save = null;
    this.wentFor = null;
    this.celebrating = false;
    this.velocity = 0;
    this.readiness = 0;
    Object.assign(this.at, this.home);
    this.rig.play('idle', { fade: 0, from: 0 });
    this.place();
    this.rig.update(0);
  }

  /** Jumps about cheering (after the last penalty), until `reset`. */
  celebrate() {
    this.save = null;
    this.celebrating = true;
    this.velocity = 0;
    this.readiness = 0;
    Object.assign(this.at, this.home);
    this.place();
    this.rig.play('celebrate', { fade: BLEND });
  }

  /** True from the kick until it is reset. */
  get moving() {
    return this.save !== null;
  }

  /** The line (z) where its gloves meet the ball. */
  get lineZ() {
    return this.home.z + GLOVE_LINE;
  }

  /**
   * Reacts to the kick. It moves after its reaction time, or later for a slow ball so it gets
   * there with it (watching the ball longer); a keeper that guessed goes at once.
   */
  react(read: ShotRead) {
    this.celebrating = false;
    // Its side-step carries on a moment: plan from where that takes it.
    this.carry = this.velocity;
    this.velocity = 0;
    this.at.x += this.carry * CARRY;
    let delay = read.read ? this.skill.reaction : 0;
    let spot = read.spot(delay);
    let save = this.plan(spot, delay, read.time, read.speed);
    if (read.read && save.start > delay) {
      // Time to spare: it watched the ball for longer, so it knows better where it goes.
      delay = save.start;
      spot = read.spot(delay);
      save = this.plan(spot, delay, read.time, read.speed);
    }
    this.save = save;
    this.saveFrom = this.at.x - this.carry * CARRY;
    this.wentFor = spot;
    this.guessed = !read.read;
    this.since = 0;
    // Steady on its feet until it goes.
    if (this.rig.playing !== 'idle') this.rig.play('ready', { fade: SAVE_BLEND });
  }

  /**
   * Which save gets its gloves to `spot`, starting no sooner than `delay` after the kick, for a
   * ball struck at `speed` (m/s) that gets there `arrive` seconds after the kick.
   */
  private plan(spot: { x: number; y: number }, delay: number, arrive: number, speed: number): Save {
    const target = { x: spot.x - this.at.x, y: spot.y - this.home.y };
    const time = Math.max(0.05, arrive - delay);
    if (Math.abs(target.x) < STAND_REACH) {
      if (target.y > TUCK_HEIGHT)
        return this.fit('tuck_jump', target, time, delay, [-STEP_SLIDE, STEP_SLIDE], JUMP_LIFT);
      // How hard it comes: harder shots get punched away, softer ones caught.
      const clip = speed > PUNCH_SPEED ? 'punch' : 'catch_chest';
      return this.fit(clip, target, time, delay, [-STEP_SLIDE, STEP_SLIDE], STAND_LIFT);
    }
    const side = target.x > 0 ? 'L' : 'R'; // its own left is the shooter's right (+x)
    const lunge: [number, number] = target.x > 0 ? [-0.1, this.skill.lunge] : [-this.skill.lunge, 0.1];
    const clip: KeeperClip = target.y > HIGH_DIVE ? `dive_high_${side}` : `dive_low_${side}`;
    return this.fit(clip, target, time, delay, lunge, DIVE_LIFT);
  }

  /**
   * Plays `clip` in its head: the moment its gloves come closest to `target` (allowing a shift
   * of up to `slide` across and `lift` up), among the moments it can reach in `time` seconds.
   */
  private fit(
    clip: KeeperClip,
    target: { x: number; y: number },
    time: number,
    delay: number,
    slide: [number, number],
    lift: [number, number],
  ): Save {
    const track = this.rig.track(clip);
    const catches = clip === 'catch_chest';
    // A catch takes the ball once its hands have closed, then holds it to its chest: aim the spot
    // between its hands at the ball. Other saves meet it anywhere on their gloves before landing.
    const land = catches ? this.rig.duration(clip) : lands(track);
    const pace = PACE[clip] ?? 1;
    const latest = Math.min(land, time * pace * this.skill.speedUp);
    let best: Save | null = null;
    let bestCost = Infinity;
    for (const s of track) {
      if (catches && s.t < HANDS_CLOSED) continue;
      if (s.t > latest && best) break;
      const near = catches ? holdSpot(s.gloves) : closestOnSegment(target, s.gloves[0], s.gloves[1]);
      const ex = target.x - near.x;
      const ey = target.y - near.y;
      const sx = clamp(ex, slide[0], slide[1]);
      const sy = clamp(ey, lift[0], lift[1]);
      const miss = Math.hypot(ex - sx, ey - sy);
      // Mostly how far it misses by, then how little it has to shift, then the sooner the better.
      const cost = miss + 0.15 * (Math.abs(sx) + Math.abs(sy)) + 0.1 * s.t;
      if (cost < bestCost) {
        bestCost = cost;
        const at = Math.max(s.t, 1e-3);
        // As fast as it has to be to get there in time, but not much slower than its pace: with
        // more time to spare it starts later instead.
        const speed = Math.max(pace * SLOWEST, at / time);
        const start = delay + Math.max(0, time - at / speed);
        best = { clip, start, at, speed, pace, land, slide: sx, lift: sy, miss };
      }
    }
    return best!;
  }

  /** Where it holds the ball while it is catching one (once its hands are closing round it), or null. */
  get catchSpot(): Vec3 | null {
    const playing = this.save?.clip === 'catch_chest' && this.rig.playing === 'catch_chest';
    return playing && this.rig.time >= CATCH_READY ? this.rig.holdSpot : null;
  }

  /** Advances the keeper by `dt` seconds. */
  step(dt: number) {
    const rig = this.rig;
    const save = this.save;
    if (save) {
      this.since += dt;
      // The side-step it was in eases out over the first moment.
      const carried = this.carry * CARRY * (1 - Math.exp(-this.since / CARRY));
      this.at.x = this.saveFrom + carried;
      if (this.since >= save.start) {
        if (rig.playing !== save.clip) {
          const fade = rig.playing === 'idle' ? SAVE_BLEND_IDLE : SAVE_BLEND;
          rig.play(save.clip, { fade, once: true, speed: save.speed });
        } else if (rig.time >= save.at) {
          // Past full stretch: eases to its usual pace.
          rig.speed = save.speed + (save.pace - save.speed) * smoothstep((rig.time - save.at) / SPEED_EASE);
        }
        // Shift across and up to meet the ball, and back down by the landing.
        const t = rig.time;
        this.at.x += save.slide * smoothstep(t / save.at);
        const up =
          t < save.at ? smoothstep(t / save.at) : 1 - smoothstep((t - save.at) / Math.max(0.05, save.land - save.at));
        this.at.y = this.home.y + save.lift * up;
      }
    } else if (!this.celebrating) {
      this.wait(dt);
    }
    this.place();
    rig.update(dt);
  }

  /**
   * Before the kick: at ease, ready while you aim, and side-stepping toward where you aim. It
   * follows like a spring, speeding up and slowing down, and the side steps blend in with its
   * speed (and play at its speed, so the feet keep up), so it never starts or stops with a jolt.
   */
  private wait(dt: number) {
    const rig = this.rig;
    const shift = this.aimX === null ? 0 : clamp(this.aimX * this.skill.lean, -MAX_SHIFT, MAX_SHIFT);
    const gap = this.home.x + shift - this.at.x;
    const fastest = rig.shuffleSpeed * MAX_STEP;
    this.velocity += (FOLLOW * FOLLOW * gap - 2 * FOLLOW * this.velocity) * dt;
    this.velocity = clamp(this.velocity, -fastest, fastest);
    this.at.x += this.velocity * dt;
    // Its own left (shuffle_L) is toward +x, the shooter's right.
    const stepping = Math.min(1, Math.abs(this.velocity) / rig.shuffleSpeed);
    const pace = Math.max(0.5, Math.abs(this.velocity) / rig.shuffleSpeed);
    rig.setSpeed('shuffle_L', pace);
    rig.setSpeed('shuffle_R', pace);
    // At ease to ready takes BLEND, and the side steps grow out of the ready stance: straight from
    // at ease to stepping would swing the arms up in a flash.
    const toward = this.ready ? 1 : 0;
    this.readiness += clamp(toward - this.readiness, -dt / BLEND, dt / BLEND);
    const r = smoothstep(this.readiness);
    rig.mix(
      {
        idle: 1 - r,
        ready: r * (1 - stepping),
        shuffle_L: this.velocity > 0 ? r * stepping : 0,
        shuffle_R: this.velocity < 0 ? r * stepping : 0,
      },
      STEP_BLEND,
    );
  }

  private place() {
    this.rig.object.position.set(this.at.x, this.at.y, this.at.z);
  }
}

/**
 * When a save comes down: after its gloves' highest point, the moment the lower glove is nearly
 * as low as it ends up (a dive landing on the grass, a jump back on its feet, a catch hugged in).
 * The ball can only be met before that.
 */
function lands(track: readonly ClipSample[]) {
  const low = (s: ClipSample) => Math.min(s.gloves[0].y, s.gloves[1].y);
  let peak = 0;
  for (let i = 1; i < track.length; i++) if (low(track[i]) > low(track[peak])) peak = i;
  const rest = low(track[track.length - 1]);
  const landed = track.find((s, i) => i > peak && low(s) <= rest + 0.1);
  return (landed ?? track[track.length - 1]).t;
}

/** The point between the two gloves (in x and y) closest to `p`. */
function closestOnSegment(p: { x: number; y: number }, a: Vec3, b: Vec3) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const k = length > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length, 0, 1) : 0;
  return { x: a.x + dx * k, y: a.y + dy * k };
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function clamp(x: number, min: number, max: number) {
  return Math.min(max, Math.max(min, x));
}

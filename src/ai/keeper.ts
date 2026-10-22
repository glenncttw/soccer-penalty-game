import { FIXED_STEP, GRAVITY, simulateFlight } from '../physics/flight';
import type { Vec3 } from '../physics/ballForces';
import type { GoalConfig } from '../worldConfig';

/** What makes one keeper better than another. */
export interface KeeperSkill {
  /** Seconds between the kick and the keeper starting to move. */
  reaction: number;
  /** How far (m) it can throw itself across in a dive, on top of how far the dive animation goes. */
  lunge: number;
  /** How much faster than its usual pace it can play a save to get there in time (1 = never faster). */
  speedUp: number;
  /** Chance (0..1) that it reads a full-power shot instead of guessing a side. Slow shots are always read. */
  read: number;
  /** How much of the curl (0..1) it sees coming. At 0 it only sees which way the ball starts. */
  curlSense: number;
  /** How far off (m) its read of a full-power shot can be. Slower shots are read better. */
  misjudge: number;
  /** Share (0..1) of the aim it edges toward while the player lines up a shot. */
  lean: number;
}

/** The game's keeper: saves soft and central shots, while well-struck corners and curled shots usually beat it. */
export const KEEPER_SKILL: KeeperSkill = {
  reaction: 0.32,
  lunge: 0.3,
  speedUp: 1.05,
  read: 0.7,
  curlSense: 0.45,
  misjudge: 0.5,
  lean: 0.12,
};

/** The keeper's read of a shot: where it thinks the ball will cross its line, and when. */
export interface ShotRead {
  /** Seconds from the kick until the ball reaches the keeper's line. */
  time: number;
  /** How fast (m/s) the ball was struck. */
  speed: number;
  /** True if it reads the flight, false if it just guessed a side. */
  read: boolean;
  /** Where it thinks the ball will cross (x across, y up), judging by what it has seen `t` seconds after the kick. */
  spot(t: number): { x: number; y: number };
}

export interface Kick {
  start: Vec3;
  velocity: Vec3;
  spin: Vec3;
}

const FULL_POWER_SPEED = 30; // m/s; misjudging grows with the square of the ball's speed
const GUESS_SPEED = 18; // m/s; slower shots give it time to read, so it never guesses

/**
 * The keeper's view of a shot. Watching the ball, it extends where the ball is
 * heading straight on to its line, so a curled shot fools it: the ball keeps
 * bending after it looks. The longer it watches, the less is left to bend, so
 * slow shots are easier to read. Better keepers sense some of the curl, misjudge
 * less and guess less often. A guess is a side picked at random.
 */
export function readShot(
  kick: Kick,
  lineZ: number,
  goal: GoalConfig,
  skill: KeeperSkill,
  random = Math.random,
): ShotRead {
  // The real flight, step by step, up to the keeper's line.
  const { start, velocity, spin } = kick;
  const seen: { t: number; p: Vec3; v: Vec3 }[] = [{ t: 0, p: { ...start }, v: { ...velocity } }];
  let real = { x: start.x, y: start.y };
  let time = (lineZ - start.z) / velocity.z;
  simulateFlight(start, velocity, spin, (p, t, v) => {
    const prev = seen[seen.length - 1].p;
    if (p.z > lineZ) {
      seen.push({ t, p: { ...p }, v: { ...v } });
      return false;
    }
    const k = (prev.z - lineZ) / (prev.z - p.z);
    real = { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k };
    time = t;
    return true;
  });

  const reach = goal.innerHalfWidth - 0.25;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const rush = clamp((speed - GUESS_SPEED) / (FULL_POWER_SPEED - GUESS_SPEED), 0, 1);
  if (random() < (1 - skill.read) * rush) {
    // A guess: left, middle or right, at a random height.
    const side = Math.floor(random() * 3) - 1;
    const guess = { x: side * reach, y: 0.5 + random() * 0.8 };
    return { time, speed, read: false, spot: () => guess };
  }

  const off = skill.misjudge * (speed / FULL_POWER_SPEED) ** 2;
  const error = { x: off * (random() + random() - 1), y: off * 0.6 * (random() + random() - 1) };
  return {
    time,
    speed,
    read: true,
    spot(t) {
      // What it sees at time t, extended straight on to its line (with gravity).
      const { p, v } = seen[Math.min(seen.length - 1, Math.max(0, Math.round(t / FIXED_STEP)))];
      const left = Math.max(0, (lineZ - p.z) / v.z);
      const x = p.x + v.x * left;
      const y = p.y + v.y * left - 0.5 * GRAVITY * left * left;
      return {
        x: clamp(x + (real.x - x) * skill.curlSense + error.x, -reach - 0.3, reach + 0.3),
        y: clamp(y + (real.y - y) * skill.curlSense + error.y, 0.2, goal.crossbarY + 0.15),
      };
    },
  };
}

function clamp(x: number, min: number, max: number) {
  return Math.min(max, Math.max(min, x));
}

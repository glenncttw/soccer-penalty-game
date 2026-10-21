import type { Vec3 } from '../physics/ballForces';

/**
 * Where the replay camera stands and looks, for each of its angles. Every angle looks toward the
 * goal: the stadium is only built for what the shooter sees, so the camera stays between the
 * spot and the goal and never turns far to the side, up into the sky or back toward the spot.
 */
export type ReplayAngle = 'follow' | 'behind' | 'high';

/** The angles, in the order the replays take turns with them. */
export const REPLAY_ANGLES: ReplayAngle[] = ['follow', 'behind', 'high'];

/** How far the camera may turn away from looking straight at the goal (radians). */
export const MAX_TURN = (30 * Math.PI) / 180;
/** How far it may look down, and up (radians). */
export const MAX_LOOK_DOWN = (30 * Math.PI) / 180;
export const MAX_LOOK_UP = (8 * Math.PI) / 180;

export interface ReplayShotInfo {
  /** The goal line's z; the goal is toward -z from the spot. */
  lineZ: number;
  groundY: number;
  /** Where the ball is at the end of the replay (it hit the keeper, the frame or the net). */
  end: Vec3;
  /** 1 when the ball went right of the middle, -1 when it went left. */
  side: number;
}

export interface ReplayCameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/**
 * The camera for `angle`, `progress` (0..1) of the way through the replay, while it watches the
 * ball at `look` (the ball's position, smoothed a little so the camera doesn't jitter).
 */
export function replayCameraPose(
  angle: ReplayAngle,
  look: Vec3,
  shot: ReplayShotInfo,
  progress: number,
): ReplayCameraPose {
  const { lineZ, groundY: ground, end, side } = shot;
  let position: Vec3;
  let target: Vec3;
  let fov: number;
  if (angle === 'behind') {
    // Just above and behind the ball, chasing it toward the goal, until it's close to the keeper.
    position = { x: look.x * 0.6, y: Math.max(ground + 0.55, look.y + 0.35), z: Math.max(lineZ + 3.2, look.z + 2) };
    target = mix(look, { x: end.x * 0.6, y: Math.max(ground + 0.8, end.y), z: lineZ - 0.5 }, 0.5);
    fov = 50;
  } else if (angle === 'high') {
    // Up high on the far side of the shot, like a TV camera, gliding in toward the goal with the ball.
    const k = smooth(progress);
    position = mix(
      { x: -side * 1.6, y: ground + 2.4, z: lineZ + 17 },
      { x: -side * 2.4, y: ground + 1.8, z: lineZ + 7.5 },
      k,
    );
    target = mix(look, { x: end.x * 0.7, y: ground + 1, z: lineZ - 0.3 }, 0.4);
    fov = 38;
  } else {
    // Low and a little to the side, on the other side from where the ball went. It rides along a
    // couple of metres behind the ball, then stops beside the goal and lets the ball go on into
    // the keeper and the net.
    position = { x: -side * 1.1, y: ground + 0.4, z: Math.max(lineZ + 4.2, look.z + 2.4) };
    const low = { x: look.x, y: Math.max(ground + 0.4, look.y), z: look.z };
    target = mix(low, { x: end.x * 0.8, y: ground + 0.85, z: lineZ - 0.3 }, 0.4);
    fov = 48;
  }
  return { position, target: keepFacingGoal(position, target), fov };
}

/** Turns a look direction back toward the goal when it strays to the side, too far up or down, or backward. */
export function keepFacingGoal(from: Vec3, at: Vec3): Vec3 {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const dz = at.z - from.z;
  const flat = Math.hypot(dx, dz);
  const dist = Math.max(1, Math.hypot(dx, dy, dz));
  // Turn: 0 = straight down the pitch toward the goal (-z).
  const turn = clamp(Math.atan2(dx, -dz), -MAX_TURN, MAX_TURN);
  const pitch = clamp(Math.atan2(dy, flat), -MAX_LOOK_DOWN, MAX_LOOK_UP);
  const c = Math.cos(pitch);
  return {
    x: from.x + Math.sin(turn) * c * dist,
    y: from.y + Math.sin(pitch) * dist,
    z: from.z - Math.cos(turn) * c * dist,
  };
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function smooth(x: number) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

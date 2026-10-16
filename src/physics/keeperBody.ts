import type { Vec3 } from './ballForces';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * The keeper's body, measured in its own frame: x across the goal (as the shooter
 * sees it), y up from the feet, z toward the shooter. Metres. Physics and the 3D
 * model both use these.
 */
export const KEEPER_BODY = {
  legs: { x: 0.12, radius: 0.085, bottom: 0.085, top: 0.46 },
  torso: { radius: 0.27, bottom: 0.56, top: 0.94 },
  head: { y: 1.3, radius: 0.22 },
  shoulder: { x: 0.29, y: 1.02 },
  arm: { radius: 0.065, length: 0.62 },
  glove: { radius: 0.13 },
} as const;

/** Where the keeper is and how it holds itself. */
export interface KeeperPose {
  /** The point between its feet, in the world. */
  pivot: Vec3;
  /** How far the whole body leans (radians); positive leans toward +x. */
  tilt: number;
  /** Glove centres in the body's own frame, the one on the -x side first. */
  gloves: [Vec3, Vec3];
  /** 0 standing tall .. 1 crouched low. Only changes the look. */
  crouch: number;
}

export interface ArmPart {
  shoulder: Vec3;
  glove: Vec3;
  /** Halfway between shoulder and glove, with the rotation that turns +y along the arm. */
  middle: Vec3;
  rotation: Quat;
  length: number;
}

/** The pose turned into world positions and rotations for each body part. */
export function keeperParts(pose: KeeperPose): { core: { position: Vec3; rotation: Quat }; arms: [ArmPart, ArmPart] } {
  const s = KEEPER_BODY.shoulder;
  const arm = (i: 0 | 1): ArmPart => {
    const shoulder = toWorld(pose, { x: i === 0 ? -s.x : s.x, y: s.y, z: 0 });
    const glove = toWorld(pose, pose.gloves[i]);
    const d = { x: glove.x - shoulder.x, y: glove.y - shoulder.y, z: glove.z - shoulder.z };
    const length = Math.hypot(d.x, d.y, d.z);
    return {
      shoulder,
      glove,
      middle: { x: (shoulder.x + glove.x) / 2, y: (shoulder.y + glove.y) / 2, z: (shoulder.z + glove.z) / 2 },
      rotation: upTo(d, length),
      length,
    };
  };
  return { core: { position: { ...pose.pivot }, rotation: tiltRotation(pose.tilt) }, arms: [arm(0), arm(1)] };
}

/** A point in the keeper's own frame, in the world. */
export function toWorld(pose: KeeperPose, p: Vec3): Vec3 {
  const c = Math.cos(pose.tilt);
  const s = Math.sin(pose.tilt);
  return { x: pose.pivot.x + p.x * c + p.y * s, y: pose.pivot.y - p.x * s + p.y * c, z: pose.pivot.z + p.z };
}

/** A point in the world, in the keeper's own frame for a body at `pivot` leaning `tilt`. */
export function toBody(pivot: Vec3, tilt: number, p: Vec3): Vec3 {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const x = p.x - pivot.x;
  const y = p.y - pivot.y;
  return { x: x * c - y * s, y: x * s + y * c, z: p.z - pivot.z };
}

/** The rotation that leans the body by `tilt` (a turn around -z). */
export function tiltRotation(tilt: number): Quat {
  return { x: 0, y: 0, z: -Math.sin(tilt / 2), w: Math.cos(tilt / 2) };
}

/** The rotation that turns +y to point along `d`. */
function upTo(d: Vec3, length: number): Quat {
  if (length < 1e-6) return { x: 0, y: 0, z: 0, w: 1 };
  const x = d.x / length;
  const y = d.y / length;
  const z = d.z / length;
  if (y < -0.999999) return { x: 1, y: 0, z: 0, w: 0 }; // straight down: half a turn
  // Half-way quaternion between +y and d: axis (+y × d), angle from their dot product.
  const q = { x: z, y: 0, z: -x, w: 1 + y };
  const n = Math.hypot(q.x, q.z, q.w);
  return { x: q.x / n, y: 0, z: q.z / n, w: q.w / n };
}

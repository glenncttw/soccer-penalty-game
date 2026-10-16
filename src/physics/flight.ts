import { BALL_MASS, BALL_RADIUS } from '../dimensions';
import { aeroForce, type Vec3 } from './ballForces';

export const FIXED_STEP = 1 / 120;
export const GRAVITY = 9.81;
/** Angular damping on the ball body; the flight model mirrors how Rapier applies it. */
export const BALL_SPIN_DAMPING = 0.3;

const MAX_FLIGHT_TIME = 4;

/**
 * Integrates a free ball flight (gravity, drag and curl, no collisions) with the
 * same fixed step as the physics world. Calls `visit` for every step and stops
 * as soon as it returns true or the ball lands.
 */
export function simulateFlight(
  start: Vec3,
  velocity: Vec3,
  spin: Vec3,
  visit: (p: Vec3, t: number) => boolean,
): void {
  const p = { ...start };
  const v = { ...velocity };
  const w = { ...spin };
  const spinDecay = 1 / (1 + FIXED_STEP * BALL_SPIN_DAMPING);

  for (let t = 0; t < MAX_FLIGHT_TIME; t += FIXED_STEP) {
    const f = aeroForce(v, w, BALL_RADIUS);
    v.x += (f.x / BALL_MASS) * FIXED_STEP;
    v.y += (f.y / BALL_MASS - GRAVITY) * FIXED_STEP;
    v.z += (f.z / BALL_MASS) * FIXED_STEP;
    p.x += v.x * FIXED_STEP;
    p.y += v.y * FIXED_STEP;
    p.z += v.z * FIXED_STEP;
    w.x *= spinDecay;
    w.y *= spinDecay;
    w.z *= spinDecay;
    if (visit(p, t) || p.y < BALL_RADIUS * 0.5) return;
  }
}

/** Where the ball crosses the plane z = planeZ, or null if it never gets there. */
export function crossingPoint(start: Vec3, velocity: Vec3, spin: Vec3, planeZ: number): Vec3 | null {
  let hit: Vec3 | null = null;
  let prev = { ...start };
  simulateFlight(start, velocity, spin, (p) => {
    if (p.z <= planeZ) {
      const k = (prev.z - planeZ) / (prev.z - p.z);
      hit = { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k, z: planeZ };
      return true;
    }
    prev = { ...p };
    return false;
  });
  return hit;
}

/**
 * Finds the kick velocity that sends a ball with the given speed and spin
 * through `target` (on the goal plane). Curl makes the ball start out wide and
 * bend back in, so the player aims where the ball should end up.
 */
export function solveKick(start: Vec3, target: Vec3, speed: number, spin: Vec3): Vec3 {
  const dx = target.x - start.x;
  const dz = target.z - start.z;
  const flat = Math.hypot(dx, dz);
  const time = flat / speed;
  // First guess: straight at the target, lifted to make up for gravity.
  const v = {
    x: (dx / flat) * speed,
    y: (target.y - start.y) / time + 0.5 * GRAVITY * time,
    z: (dz / flat) * speed,
  };

  for (let i = 0; i < 12; i++) {
    const hit = crossingPoint(start, v, spin, target.z);
    if (!hit) {
      v.y += 1; // fell short: kick it higher
      continue;
    }
    const ex = target.x - hit.x;
    const ey = target.y - hit.y;
    if (Math.abs(ex) < 0.01 && Math.abs(ey) < 0.01) break;
    v.x += ex / time;
    v.y += ey / time;
  }
  return v;
}

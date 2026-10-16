export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const AIR_DENSITY = 1.2; // kg/m³
const DRAG_COEFFICIENT = 0.25;
const LIFT_COEFFICIENT = 1; // tuned for a clearly visible, fun curl

/**
 * Aerodynamic force on a spinning ball: quadratic drag against the velocity
 * plus the Magnus force (spin × velocity) that makes the ball curl.
 */
export function aeroForce(velocity: Vec3, angularVelocity: Vec3, radius: number): Vec3 {
  const area = Math.PI * radius * radius;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const drag = 0.5 * AIR_DENSITY * DRAG_COEFFICIENT * area * speed;
  const magnus = 0.5 * AIR_DENSITY * LIFT_COEFFICIENT * area * radius;
  const w = angularVelocity;
  const v = velocity;

  return {
    x: -drag * v.x + magnus * (w.y * v.z - w.z * v.y),
    y: -drag * v.y + magnus * (w.z * v.x - w.x * v.z),
    z: -drag * v.z + magnus * (w.x * v.y - w.y * v.x),
  };
}

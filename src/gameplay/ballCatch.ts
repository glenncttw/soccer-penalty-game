import type { Vec3 } from '../physics/ballForces';
import type { Contact, PhysicsWorld } from '../physics/world';

const CATCH_RADIUS = 0.4; // metres: a ball passing this close to the keeper's hands while it catches is caught
const SETTLE_TIME = 0.08; // seconds a caught ball takes to settle into the hands

/**
 * The keeper catching the ball (its catch_chest save). While the keeper's hands are closing, a
 * ball heading within CATCH_RADIUS of the spot between them is taken: it stops flying, passes
 * through the keeper's solid parts, slides into its hands and then goes wherever they go, hugged
 * to its chest. Call `step` every physics step, before the physics steps.
 */
export class BallCatch {
  /** True once the ball is in the keeper's hands (until `reset`). */
  caught = false;
  private from: Vec3 = { x: 0, y: 0, z: 0 };
  private last: Vec3 = { x: 0, y: 0, z: 0 };
  private time = 0;

  reset() {
    this.caught = false;
  }

  /**
   * `spot` is where the keeper holds the ball now (null when it isn't catching). Returns the touch
   * when it takes the ball this step.
   */
  step(spot: Vec3 | null, physics: PhysicsWorld, dt: number): Contact | null {
    if (this.caught) {
      this.time += dt;
      if (spot) this.last = { ...spot };
      const k = smoothstep(this.time / SETTLE_TIME);
      physics.holdBall({
        x: this.from.x + (this.last.x - this.from.x) * k,
        y: this.from.y + (this.last.y - this.from.y) * k,
        z: this.from.z + (this.last.z - this.from.z) * k,
      });
      return null;
    }
    if (!spot) return null;
    // Where the ball goes this step: caught if that passes close enough to the hands.
    const p = physics.ball.translation();
    const v = physics.ball.linvel();
    const next = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
    if (distanceToSegment(spot, p, next) > CATCH_RADIUS) return null;
    this.caught = true;
    this.time = 0;
    this.from = { x: p.x, y: p.y, z: p.z };
    this.last = { ...spot };
    physics.ignoreKeeper(true);
    physics.holdBall(this.from);
    return {
      surface: 'keeper',
      point: { ...this.from },
      velocity: { x: v.x, y: v.y, z: v.z },
      speed: Math.hypot(v.x, v.y, v.z),
    };
  }
}

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const length = d.x * d.x + d.y * d.y + d.z * d.z;
  const k =
    length > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / length)) : 0;
  return Math.hypot(a.x + d.x * k - p.x, a.y + d.y * k - p.y, a.z + d.z * k - p.z);
}

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

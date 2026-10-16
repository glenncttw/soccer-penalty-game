import { BALL_RADIUS, GOAL_HEIGHT, GOAL_WIDTH, POST_RADIUS } from '../dimensions';
import type { Vec3 } from '../physics/ballForces';

export type ShotResult = 'goal' | 'miss';

const TOUCH = BALL_RADIUS + POST_RADIUS + 0.03;

/** Watches the ball after a kick and decides if it went in, and whether it hit the frame. */
export class OutcomeTracker {
  result: ShotResult | null = null;
  hitFrame = false;
  private elapsed = 0;

  reset() {
    this.result = null;
    this.hitFrame = false;
    this.elapsed = 0;
  }

  update(p: Vec3, speed: number, dt: number): ShotResult | null {
    if (this.result) return this.result;
    this.elapsed += dt;
    const halfW = GOAL_WIDTH / 2;

    // Close to a post or the crossbar?
    if (Math.abs(p.z) < TOUCH) {
      const nearPost = Math.min(Math.abs(p.x - halfW), Math.abs(p.x + halfW)) < TOUCH && p.y < GOAL_HEIGHT + TOUCH;
      const nearBar = Math.abs(p.y - GOAL_HEIGHT) < TOUCH && Math.abs(p.x) < halfW + TOUCH;
      if (nearPost || nearBar) this.hitFrame = true;
    }

    const fullyOver = p.z < -BALL_RADIUS;
    if (fullyOver && Math.abs(p.x) < halfW && p.y < GOAL_HEIGHT) this.result = 'goal';
    else if (fullyOver || p.z < -3 || Math.abs(p.x) > 30 || this.elapsed > 4 || (this.elapsed > 0.5 && speed < 0.3)) {
      this.result = 'miss';
    }
    return this.result;
  }
}

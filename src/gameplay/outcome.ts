import type { Vec3 } from '../physics/ballForces';
import type { GoalConfig } from '../worldConfig';

export type ShotResult = 'goal' | 'miss';

/** Watches the ball after a kick and decides if it went in, and whether it hit the frame. */
export class OutcomeTracker {
  result: ShotResult | null = null;
  hitFrame = false;
  private elapsed = 0;

  constructor(
    private readonly goal: GoalConfig,
    private readonly ballRadius: number,
  ) {}

  reset() {
    this.result = null;
    this.hitFrame = false;
    this.elapsed = 0;
  }

  update(p: Vec3, speed: number, dt: number): ShotResult | null {
    if (this.result) return this.result;
    this.elapsed += dt;
    const g = this.goal;
    const touch = this.ballRadius + 0.03;
    const halfT = g.postThickness / 2;
    const z = p.z - g.lineZ;

    // Touching a post or the crossbar? (distance from the ball centre to each box)
    if (Math.abs(z) < g.postDepth / 2 + touch) {
      const postX = g.innerHalfWidth + halfT;
      const nearPost =
        Math.min(Math.abs(p.x - postX), Math.abs(p.x + postX)) < halfT + touch && p.y < g.outerHeight + touch;
      const nearBar =
        p.y > g.crossbarY - touch && p.y < g.outerHeight + touch && Math.abs(p.x) < g.outerHalfWidth + touch;
      if (nearPost || nearBar) this.hitFrame = true;
    }

    // The whole ball must be over the whole line, inside the posts and under the bar.
    const fullyOver = z < -(g.postDepth / 2 + this.ballRadius);
    if (fullyOver && Math.abs(p.x) < g.innerHalfWidth && p.y < g.crossbarY) this.result = 'goal';
    else if (fullyOver || z < -3 || Math.abs(p.x) > 30 || this.elapsed > 4 || (this.elapsed > 0.5 && speed < 0.3)) {
      this.result = 'miss';
    }
    return this.result;
  }
}

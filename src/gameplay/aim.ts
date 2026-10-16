import type { Vec3 } from '../physics/ballForces';
import type { GoalConfig } from '../worldConfig';

/** Keeps an aim point inside the goal frame, so the whole ball fits between the posts and under the bar. */
export function clampAimToGoal(aim: Vec3, goal: GoalConfig, groundY: number, ballRadius: number) {
  const maxX = goal.innerHalfWidth - ballRadius;
  aim.x = Math.min(maxX, Math.max(-maxX, aim.x));
  aim.y = Math.min(goal.crossbarY - ballRadius, Math.max(groundY + ballRadius, aim.y));
}

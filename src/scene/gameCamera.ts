import * as THREE from 'three';
import type { WorldConfig } from '../worldConfig';

const DESIGN_ASPECT = 16 / 9;
const GOAL_MARGIN = 0.8; // metres kept visible beside each post on narrow screens

/**
 * The gameplay camera from the Blender scene. Its vertical field of view is
 * kept as designed; on screens narrower than 16:9 it widens just enough to keep
 * the whole goal (plus a margin) in view.
 */
export function createGameCamera(config: WorldConfig) {
  const c = config.camera;
  const camera = new THREE.PerspectiveCamera(c.fov, DESIGN_ASPECT, 0.05, 400);
  camera.position.set(c.position.x, c.position.y, c.position.z);
  camera.quaternion.set(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w);

  const goalDistance = c.position.z - config.goal.lineZ;
  const goalHalfAngle = Math.atan((config.goal.outerHalfWidth + GOAL_MARGIN) / goalDistance);

  function fit(aspect: number) {
    camera.aspect = aspect;
    const neededVertical = 2 * Math.atan(Math.tan(goalHalfAngle) / aspect);
    camera.fov = Math.max(c.fov, THREE.MathUtils.radToDeg(neededVertical));
    camera.updateProjectionMatrix();
  }

  return { camera, fit };
}

import * as THREE from 'three';
import type { WorldConfig } from '../worldConfig';

const DESIGN_ASPECT = 16 / 9;
const GOAL_MARGIN = 0.8; // metres kept visible beside each post on narrow screens

// Charging slowly pushes the camera toward the ball and tightens the view, to build tension.
const PUSH_DISTANCE = 0.45; // metres forward at full charge
const PUSH_DROP = 0.05; // metres down at full charge, so the ball stays in frame
const PUSH_ZOOM = 0.05; // share of the field of view taken away at full charge
// A small turn around the goal that follows the mouse, so the stadium feels 3D.
const SWAY_ANGLE = 0.009; // radians at the screen edge
// Shake: "trauma" (0..1) is added by impacts and fades out; the shake is trauma squared.
const SHAKE_ANGLE = { pitch: 0.022, yaw: 0.018, roll: 0.012 }; // radians at full trauma
const SHAKE_SPEED = 17; // how fast the shake wobbles
const TRAUMA_FADE = 1.3; // trauma lost per second

export interface CameraState {
  /** True while the player holds a shot. */
  charging: boolean;
  /** Pointer x in -1..1 to sway toward, or null to settle back to the designed view. */
  swayTarget: number | null;
}

/**
 * The gameplay camera from the Blender scene. At rest it is exactly the designed
 * view; its vertical field of view only widens on screens narrower than 16:9 to
 * keep the whole goal (plus a margin) in view. On top of that rest pose it
 * pushes in while charging, sways with the mouse and shakes on impacts.
 */
export function createGameCamera(config: WorldConfig) {
  const c = config.camera;
  const camera = new THREE.PerspectiveCamera(c.fov, DESIGN_ASPECT, 0.05, 400);
  const restPosition = new THREE.Vector3(c.position.x, c.position.y, c.position.z);
  const restQuaternion = new THREE.Quaternion(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(restQuaternion);
  const pivot = new THREE.Vector3(0, c.position.y, config.goal.lineZ); // sway turns around the goal
  camera.position.copy(restPosition);
  camera.quaternion.copy(restQuaternion);

  const goalDistance = c.position.z - config.goal.lineZ;
  const goalHalfAngle = Math.atan((config.goal.outerHalfWidth + GOAL_MARGIN) / goalDistance);
  let restFov = c.fov;

  let charge = 0;
  let sway = 0;
  let trauma = 0;
  let time = 0;
  const turn = new THREE.Quaternion();
  const shake = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const up = new THREE.Vector3(0, 1, 0);

  function fit(aspect: number) {
    camera.aspect = aspect;
    const neededVertical = 2 * Math.atan(Math.tan(goalHalfAngle) / aspect);
    restFov = Math.max(c.fov, THREE.MathUtils.radToDeg(neededVertical));
    camera.fov = restFov;
    camera.updateProjectionMatrix();
  }

  /** Adds shake; big impacts add more. Capped at 1. */
  function addTrauma(amount: number) {
    trauma = Math.min(1, trauma + amount);
  }

  function update(dt: number, state: CameraState) {
    time += dt;
    // Ease in slowly while charging, snap back quickly on release.
    charge = THREE.MathUtils.damp(charge, state.charging ? 1 : 0, state.charging ? 1.5 : 7, dt);
    if (state.swayTarget !== null) sway = THREE.MathUtils.damp(sway, state.swayTarget, 2.5, dt);
    else sway = THREE.MathUtils.damp(sway, 0, 1.5, dt);
    trauma = Math.max(0, trauma - TRAUMA_FADE * dt);

    const push = charge * charge * (3 - 2 * charge); // smoothstep
    turn.setFromAxisAngle(up, -sway * SWAY_ANGLE);
    camera.position
      .copy(restPosition)
      .addScaledVector(forward, PUSH_DISTANCE * push)
      .sub(pivot)
      .applyQuaternion(turn)
      .add(pivot);
    camera.position.y -= PUSH_DROP * push;

    const s = trauma * trauma;
    euler.set(
      s * SHAKE_ANGLE.pitch * wobble(time * SHAKE_SPEED, 0),
      s * SHAKE_ANGLE.yaw * wobble(time * SHAKE_SPEED, 1),
      s * SHAKE_ANGLE.roll * wobble(time * SHAKE_SPEED, 2),
    );
    shake.setFromEuler(euler);
    camera.quaternion.copy(turn).multiply(restQuaternion).multiply(shake);

    const fov = restFov * (1 - PUSH_ZOOM * push);
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return { camera, fit, update, addTrauma };
}

/** Smooth random wobble in -1..1; each channel wobbles differently. */
function wobble(t: number, channel: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const k = f * f * (3 - 2 * f);
  return lerp(hash(i, channel), hash(i + 1, channel), k);
}

function hash(i: number, channel: number): number {
  const x = Math.sin(i * 127.1 + channel * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

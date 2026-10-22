import * as THREE from 'three';
import type { WorldConfig } from '../worldConfig';
import { CAMERA_SETTINGS, type CameraSettings } from './cameraSettings';

const DESIGN_ASPECT = 16 / 9;
const GOAL_MARGIN = 0.8; // metres kept visible beside each post on narrow screens

// Charging slowly pushes the camera toward the ball and tightens the view, to build tension.
const PUSH_DISTANCE = 0.45; // metres forward at full charge
const PUSH_DROP = 0.05; // metres down at full charge, so the ball stays in frame
const PUSH_ZOOM = 0.05; // share of the field of view taken away at full charge
// A small turn around the goal that follows the mouse, so the stadium feels 3D.
const SWAY_ANGLE = 0.009; // radians at the left and right screen edges
const SWAY_TILT = 0.007; // radians at the top and bottom screen edges
// Shake: "trauma" (0..1) is added by impacts and fades out; the shake is trauma squared.
const SHAKE_ANGLE = { pitch: 0.022, yaw: 0.018, roll: 0.012 }; // radians at full trauma
const SHAKE_SPEED = 17; // how fast the shake wobbles
const TRAUMA_FADE = 1.3; // trauma lost per second
// The intro: the camera starts close to the goal and pulls straight back to the rest view.
const INTRO_FORWARD = 10; // metres toward the goal along the view at the start (about 6 m from the goal line)
const INTRO_RISE = 0.3; // metres higher at the start
// The end of a round: the camera moves in close to the keeper dancing in front of its goal, with the keeper on
// the left (the score goes on the right, src/style.css) or, on screens taller than wide, at the top.
const END_TIME = 1.4; // seconds to move in (and back out)
const KEEPER_SIZE = 1.6; // metres: the keeper's height, to frame it
// A hero shot: low down, looking up at it from a little to one side, the picture tilted, drifting slowly round it.
const END_HEIGHT = 0.4; // metres up
const END_ORBIT = THREE.MathUtils.degToRad(25); // round to the keeper's left (our right) from straight in front
const END_ROLL = THREE.MathUtils.degToRad(4); // the picture's tilt
const END_DRIFT = { angle: THREE.MathUtils.degToRad(6), rise: 0.06, time: 9 }; // the slow drift round it, and its seconds
const END_FRAME = {
  wide: { x: -0.48, y: -0.05, height: 0.62 }, // the keeper's middle on screen (-1..1 across and up) and its share of the height
  tall: { x: 0, y: 0.38, height: 0.32 },
};

export interface CameraState {
  /** True while the player holds a shot. */
  charging: boolean;
  /** Pointer position (x and y in -1..1) to sway toward, or null to settle back to the designed view. */
  swayTarget: { x: number; y: number } | null;
  /** How close to the goal the intro has the camera: 1 close up, 0 (or left out) the normal view. */
  intro?: number;
  /** True while the end of a round shows: the camera moves in close to the keeper (see `keeper`). */
  ending?: boolean;
}

/**
 * The gameplay camera. At rest it is the view from `CameraSettings` (behind the
 * ball, looking at the goal); its vertical field of view only widens on screens
 * narrower than 16:9 if that is needed to keep the whole goal (plus a margin) in
 * view. On top of that rest pose it pushes in while charging, sways with the
 * mouse (sideways and up and down) and shakes on impacts.
 */
export function createGameCamera(
  config: WorldConfig,
  settings: CameraSettings = CAMERA_SETTINGS,
  keeper: { x: number; y: number; z: number } = { x: 0, y: config.groundY, z: config.goal.lineZ },
) {
  const camera = new THREE.PerspectiveCamera(settings.fov, DESIGN_ASPECT, 0.05, 400);
  const restPosition = new THREE.Vector3();
  const restQuaternion = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const pivot = new THREE.Vector3(); // sway turns around the goal
  let designFov = settings.fov;
  let goalHalfAngle = 0;
  let restFov = designFov;
  const endPosition = new THREE.Vector3();
  const endQuaternion = new THREE.Quaternion();
  const aimer = new THREE.PerspectiveCamera();
  const middle = new THREE.Vector3(keeper.x, keeper.y + KEEPER_SIZE / 2, keeper.z);
  let endFrame = END_FRAME.wide;
  let endDistance = 1;
  const toCamera = new THREE.Vector3();
  const across = new THREE.Vector3();
  const look = new THREE.Vector3();
  const seen = new THREE.Vector3();
  let ending = 0; // 0..1 of the way in

  let charge = 0;
  const sway = { x: 0, y: 0 };
  let trauma = 0;
  let time = 0;
  const turn = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const shake = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);

  function fit(aspect: number) {
    camera.aspect = aspect;
    const neededVertical = 2 * Math.atan(Math.tan(goalHalfAngle) / aspect);
    restFov = Math.max(designFov, THREE.MathUtils.radToDeg(neededVertical));
    camera.fov = restFov;
    camera.updateProjectionMatrix();
    // The end of a round: close enough that the keeper fills its share of the height.
    endFrame = aspect >= 1 ? END_FRAME.wide : END_FRAME.tall;
    endDistance = KEEPER_SIZE / (2 * endFrame.height * Math.tan(THREE.MathUtils.degToRad(restFov) / 2));
    aimer.fov = restFov;
    aimer.aspect = aspect;
    aimer.updateProjectionMatrix();
  }

  /**
   * The end of a round's close-up at `time` seconds: round to one side of the keeper and low, slid sideways
   * toward where the frame has it, then turned (a few small corrections) until its middle sits exactly there.
   */
  function aimEnd(time: number) {
    const wave = Math.sin((2 * Math.PI * time) / END_DRIFT.time);
    const orbit = END_ORBIT + END_DRIFT.angle * wave;
    toCamera.set(Math.sin(orbit), 0, Math.cos(orbit));
    across.set(Math.cos(orbit), 0, -Math.sin(orbit)); // screen right
    const tanV = Math.tan(THREE.MathUtils.degToRad(aimer.fov) / 2);
    const perX = endDistance * tanV * aimer.aspect; // metres across per unit of screen, at the keeper
    const perY = endDistance * tanV;
    endPosition
      .copy(middle)
      .addScaledVector(toCamera, endDistance)
      .addScaledVector(across, -endFrame.x * perX)
      .setY(keeper.y + END_HEIGHT + END_DRIFT.rise * Math.cos((2 * Math.PI * time) / (END_DRIFT.time * 0.7)));
    aimer.position.copy(endPosition);
    look.copy(middle);
    for (let i = 0; i < 8; i++) {
      aimer.lookAt(look);
      aimer.rotateZ(END_ROLL);
      aimer.updateMatrixWorld();
      seen.copy(middle).project(aimer);
      look.addScaledVector(across, (seen.x - endFrame.x) * perX);
      look.y += (seen.y - endFrame.y) * perY;
    }
    endQuaternion.copy(aimer.quaternion);
  }

  /** Moves the rest view to new settings straight away (the settings editor uses this). */
  function setSettings(s: CameraSettings) {
    const rest = restPose(config, s);
    restPosition.copy(rest.position);
    restQuaternion.copy(rest.quaternion);
    forward.set(0, 0, -1).applyQuaternion(restQuaternion);
    pivot.set(0, restPosition.y, config.goal.lineZ);
    camera.position.copy(restPosition);
    camera.quaternion.copy(restQuaternion);
    goalHalfAngle = Math.atan((config.goal.outerHalfWidth + GOAL_MARGIN) / (restPosition.z - config.goal.lineZ));
    designFov = s.fov;
    // A shifted view window slides the picture without turning the camera; aiming
    // follows it because it is part of the camera's projection.
    if (s.verticalShift) camera.setViewOffset(1, 1, 0, s.verticalShift, 1, 1);
    else camera.clearViewOffset();
    fit(camera.aspect);
  }
  setSettings(settings);

  /** Adds shake; big impacts add more. Capped at 1. */
  function addTrauma(amount: number) {
    trauma = Math.min(1, trauma + amount);
  }

  function update(dt: number, state: CameraState) {
    time += dt;
    // Ease in slowly while charging, snap back quickly on release.
    charge = THREE.MathUtils.damp(charge, state.charging ? 1 : 0, state.charging ? 1.5 : 7, dt);
    const target = state.swayTarget ?? { x: 0, y: 0 };
    const rate = state.swayTarget ? 2.5 : 1.5;
    sway.x = THREE.MathUtils.damp(sway.x, target.x, rate, dt);
    sway.y = THREE.MathUtils.damp(sway.y, target.y, rate, dt);
    trauma = Math.max(0, trauma - TRAUMA_FADE * dt);
    ending = THREE.MathUtils.clamp(ending + (state.ending ? dt : -dt) / END_TIME, 0, 1);

    const push = charge * charge * (3 - 2 * charge); // smoothstep
    // Pointer right or up: the camera circles the goal to the left or down, so the view turns toward it.
    turn.setFromAxisAngle(up, -sway.x * SWAY_ANGLE).multiply(tilt.setFromAxisAngle(right, sway.y * SWAY_TILT));
    camera.position
      .copy(restPosition)
      .addScaledVector(forward, PUSH_DISTANCE * push)
      .sub(pivot)
      .applyQuaternion(turn)
      .add(pivot);
    camera.position.y -= PUSH_DROP * push;
    const intro = state.intro ?? 0;
    camera.position.addScaledVector(forward, INTRO_FORWARD * intro);
    camera.position.y += INTRO_RISE * intro;

    const s = trauma * trauma;
    euler.set(
      s * SHAKE_ANGLE.pitch * wobble(time * SHAKE_SPEED, 0),
      s * SHAKE_ANGLE.yaw * wobble(time * SHAKE_SPEED, 1),
      s * SHAKE_ANGLE.roll * wobble(time * SHAKE_SPEED, 2),
    );
    shake.setFromEuler(euler);
    camera.quaternion.copy(turn).multiply(restQuaternion).multiply(shake);
    if (ending > 0) {
      aimEnd(time);
      const k = ending < 0.5 ? 4 * ending ** 3 : 1 - (-2 * ending + 2) ** 3 / 2; // ease in and out
      camera.position.lerp(endPosition, k);
      camera.quaternion.slerp(endQuaternion, k);
    }

    const fov = restFov * (1 - PUSH_ZOOM * push);
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return { camera, restPosition, restQuaternion, fit, update, addTrauma, setSettings };
}

/** The rest position, behind the ball, and the rotation that looks at the target on the goal line. */
export function restPose(config: WorldConfig, s: CameraSettings) {
  const ball = config.ballStart;
  const position = new THREE.Vector3(ball.x, config.groundY + s.height, ball.z + s.distanceBehindBall);
  const target = new THREE.Vector3(ball.x, config.groundY + s.targetHeight, config.goal.lineZ);
  const look = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0));
  return { position, quaternion: new THREE.Quaternion().setFromRotationMatrix(look) };
}

/** The settings that give the camera from the Blender scene. */
export function cameraSettingsFromBlender(config: WorldConfig): CameraSettings {
  const c = config.camera;
  const look = new THREE.Vector3(0, 0, -1).applyQuaternion(
    new THREE.Quaternion(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).normalize(),
  );
  const toGoalLine = (config.goal.lineZ - c.position.z) / look.z;
  return {
    height: c.position.y - config.groundY,
    distanceBehindBall: c.position.z - config.ballStart.z,
    targetHeight: c.position.y + look.y * toGoalLine - config.groundY,
    fov: c.fov,
    verticalShift: 0,
  };
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

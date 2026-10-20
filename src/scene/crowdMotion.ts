import * as THREE from 'three';
import type { CrowdSettings } from './crowdSettings';
import type { Moves } from './crowdSpots';

/**
 * How the crowd moves, worked out per vertex on the graphics card so it costs next to nothing:
 * every person sways and looks around a little, and the cheering ones raise their arms now and
 * then (up past their sides, so they don't hit the rail in front) and bounce while they do. Each person has their own timing (see `motionOf`).
 *
 * A part moves about its own origin, as placed in Blender, and the kind of part is told by where
 * that origin is: at the feet (the body) it stays put, off to a side it's an arm (swinging up from
 * the shoulder), in the middle higher up it's the head. Parts inside another part
 * (like the hair in the head) move with it.
 */

/** What kind of part a vertex belongs to. */
export const Limb = { Body: 0, Arm: 1, Head: 2 } as const;
export type Limb = (typeof Limb)[keyof typeof Limb];

/** An origin this close to the feet is the body's. */
const AT_FEET = 0.01;
/** An origin this far to a side is an arm's. */
const TO_A_SIDE = 0.05;

export function limbAt(pivot: THREE.Vector3): Limb {
  if (pivot.length() < AT_FEET) return Limb.Body;
  return Math.abs(pivot.x) > TO_A_SIDE ? Limb.Arm : Limb.Head;
}

/**
 * One person's own timing, as numbers for the shader: where in their moves they start, how fast
 * they move, how much they move (1 = cheering, 0 = moving about, -1 = calm), and which arms they
 * raise (-1 = right, 1 = left, 0 = both).
 */
export function motionOf(random: () => number, moves: Moves): [number, number, number, number] {
  const phase = random();
  const speed = 0.8 + 0.45 * random();
  const pick = random();
  const arms = pick < 0.5 ? 0 : pick < 0.75 ? -1 : 1;
  return [phase, speed, moves === 'cheer' ? 1 : moves === 'move' ? 0 : -1, arms];
}

/**
 * The poses a part can reach, as transforms in the person's own space: for measuring the room a
 * person needs while moving (so nobody's arm goes into a rail or a neighbour). The same moves as
 * the shader, at their furthest and a few steps between.
 */
export function reachablePoses(limb: Limb, pivot: THREE.Vector3, s: CrowdSettings, moves: Moves): THREE.Matrix4[] {
  const deg = THREE.MathUtils.degToRad;
  const about = (r: THREE.Matrix4) =>
    new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(r)
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  if (!s.motion) return [new THREE.Matrix4()];
  const limbPoses: THREE.Matrix4[] = [new THREE.Matrix4()];
  if (limb === Limb.Arm && moves === 'cheer') {
    for (const cheer of [0.25, 0.5, 0.75, 1]) {
      const r = new THREE.Matrix4()
        .makeRotationX(-deg(s.armForward) * cheer)
        .multiply(new THREE.Matrix4().makeRotationZ(Math.sign(pivot.x) * deg(s.armRaise) * cheer));
      limbPoses.push(about(r));
    }
  } else if (limb === Limb.Head && moves !== 'calm') {
    for (const turn of [-1, 0, 1]) {
      for (const nod of [-1, 0, 1]) {
        limbPoses.push(
          about(
            new THREE.Matrix4()
              .makeRotationY(deg(s.headTurn) * turn)
              .multiply(new THREE.Matrix4().makeRotationX(deg(s.headNod) * nod)),
          ),
        );
      }
    }
  }
  const poses: THREE.Matrix4[] = [];
  for (const sway of moves === 'calm' ? [0] : [-1, 0, 1]) {
    for (const bob of [0, 1]) {
      const body = new THREE.Matrix4()
        .makeTranslation(0, s.bob * bob, 0)
        .multiply(new THREE.Matrix4().makeRotationY(deg(s.sway) * sway));
      for (const p of limbPoses) poses.push(body.clone().multiply(p));
    }
  }
  return poses;
}

/**
 * How a flag bearer holds the pole: the arm on the pole's side lifted out to the side and forward
 * (degrees, about the shoulder), so the hand is beside their head, above the rail in front of them,
 * and the pole goes up past their head's side (their head is big next to their arms).
 */
export const HOLD_POSE = { raise: 35, forward: 110 };

/** The holding arm's pose, as a transform in the person's own space (the same as the shader). */
export function holdingPose(pivot: THREE.Vector3): THREE.Matrix4 {
  const deg = THREE.MathUtils.degToRad;
  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new THREE.Matrix4().makeRotationX(-deg(HOLD_POSE.forward)))
    .multiply(new THREE.Matrix4().makeRotationZ(Math.sign(pivot.x) * deg(HOLD_POSE.raise)))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/** The uniforms the moves read; `time` is set every frame. */
export function motionUniforms(s: CrowdSettings) {
  const deg = THREE.MathUtils.degToRad;
  return {
    uCrowdTime: { value: 0 },
    uCrowdMotion: { value: s.motion ? 1 : 0 },
    uBob: { value: s.bob },
    uBobSpeed: { value: s.bobSpeed },
    uSway: { value: deg(s.sway) },
    uHeadTurn: { value: deg(s.headTurn) },
    uHeadNod: { value: deg(s.headNod) },
    uCheerEvery: { value: s.cheerEvery },
    uArmRaise: { value: deg(s.armRaise) },
    uArmForward: { value: deg(s.armForward) },
    uHoldRaise: { value: deg(HOLD_POSE.raise) },
    uHoldForward: { value: deg(HOLD_POSE.forward) },
  };
}

/** Adds the moves to a material's vertex shader (MeshStandardMaterial's, as three.js builds it). */
export function addMotion(
  shader: THREE.WebGLProgramParametersWithUniforms,
  uniforms: ReturnType<typeof motionUniforms>,
) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      'void main() {',
      `uniform float uCrowdTime, uCrowdMotion, uBob, uBobSpeed, uSway, uHeadTurn, uHeadNod, uCheerEvery, uArmRaise, uArmForward;
      uniform float uHoldRaise, uHoldForward;
      attribute vec3 aPivot;
      attribute float aLimb;
      attribute vec4 aMotion; // phase, speed, how much (1 cheer, 0 move, -1 calm), arms (-1 right, 1 left, 0 both)
      // For a flag bearer: the side of the pole (1 left, -1 right; 0 for everyone else), how far, how often (per
      // second) and from where (0..1) they lift the flag up and down (the same as the flag's own lifting).
      attribute vec4 aHold;
      mat3 crowdRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      mat3 crowdRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 crowdRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
      void main() {`,
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      float crowdT = uCrowdTime * aMotion.y + aMotion.x * 10.0;
      // Arms go up for about a third of each cheer, with smooth starts and ends.
      float crowdU = fract(crowdT / uCheerEvery + aMotion.x);
      float crowdMoves = uCrowdMotion * step(-0.5, aMotion.z); // calm people only bounce
      float crowdCheer = uCrowdMotion * max(aMotion.z, 0.0) * smoothstep(0.0, 0.12, crowdU) * (1.0 - smoothstep(0.32, 0.46, crowdU));
      mat3 crowdLimb = mat3(1.0);
      // A flag bearer holds still (bar their flag's lifting), their arm on the pole's side up holding it.
      float crowdHolds = abs(aHold.x);
      crowdMoves *= 1.0 - crowdHolds;
      crowdCheer *= 1.0 - crowdHolds;
      if (aLimb == 1.0 && aHold.x * aPivot.x > 0.0) {
        crowdLimb = crowdRotX(-uHoldForward) * crowdRotZ(sign(aPivot.x) * uHoldRaise);
      } else if (aLimb == 1.0 && (aMotion.w == 0.0 || aMotion.w * aPivot.x > 0.0)) {
        crowdLimb = crowdRotX(-uArmForward * crowdCheer) * crowdRotZ(sign(aPivot.x) * uArmRaise * crowdCheer);
      } else if (aLimb == 2.0) {
        crowdLimb = crowdRotY(crowdMoves * uHeadTurn * sin(6.2832 * (crowdT * 0.11 + aMotion.x)))
          * crowdRotX(crowdMoves * uHeadNod * sin(6.2832 * (crowdT * 0.29 + aMotion.x * 2.0)));
      }
      mat3 crowdBody = crowdRotY(crowdMoves * uSway * sin(6.2832 * (crowdT * 0.17 + aMotion.x * 3.0)));
      // A small bounce for everyone, a full one while cheering; never below the floor.
      float crowdBob = uCrowdMotion * uBob * (0.25 + 0.75 * crowdCheer) * (0.5 - 0.5 * cos(6.2832 * crowdT * uBobSpeed));
      crowdBob = mix(crowdBob, aHold.y * (0.5 - 0.5 * cos(6.2832 * (aHold.z * uCrowdTime + aHold.w))), crowdHolds);
      objectNormal = crowdBody * (crowdLimb * objectNormal);`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed = crowdBody * (crowdLimb * (transformed - aPivot) + aPivot) + vec3(0.0, crowdBob, 0.0);`,
    );
}

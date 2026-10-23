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
    // Reacting to a shot (see Crowd.react), on the real clock so a goal's slow motion doesn't slow them.
    uCrowdClock: { value: 0 },
    uReactAt: { value: -1e4 },
    uReactEnd: { value: 1e9 },
    uMood: { value: Mood.None as number },
    uJump: { value: 0 },
    // A Mexican wave (see Crowd.wave), on the same clock: when it started and when a goal or save stopped it.
    uWaveAt: { value: -1e4 },
    uWaveEnd: { value: 1e9 },
    uWaveDir: { value: 1 },
    uReactDelay: { value: s.reactDelay },
    uGoalShout: { value: s.goalShout },
    uShoutShare: { value: s.shoutShare },
    uSaveSulk: { value: s.saveSulk },
    uFrownShare: { value: s.frownShare },
    uRestSmile: { value: s.restSmile },
    uJumpTime: { value: s.jumpTime },
    uJumpHeight: { value: s.jumpHeight },
    uWaveLap: { value: s.waveLap },
    uWaveLaps: { value: s.waveLaps },
    uWaveWidth: { value: s.waveWidth },
    uWaveRise: { value: s.waveRise },
  };
}

/** How the crowd feels about the last shot: their faces. */
export const Mood = { None: 0, Goal: 1, Save: 2 } as const;
export type Mood = (typeof Mood)[keyof typeof Mood];

/**
 * How high someone is lifted (metres) `since` seconds after their reaction to a goal started, and how far
 * their arms are up (0..1): the same as the shader. `own` is their own random number (0..1). They jump until
 * `calmAt` seconds after it started (the next shot), then ease out of it.
 */
export function jumpLift(
  since: number,
  own: number,
  s: CrowdSettings,
  calmAt = Infinity,
): { lift: number; arms: number } {
  if (since <= 0 || since >= calmAt + CALM_TIME) return { lift: 0, arms: 0 };
  const on = 1 - smoothstep(calmAt, calmAt + CALM_TIME, since);
  const u = (since / s.jumpTime) % 1;
  return { lift: on * s.jumpHeight * (0.6 + 0.4 * own) * 4 * u * (1 - u), arms: on * smoothstep(0, 0.1, since) };
}

/** Seconds the crowd takes to calm down from a reaction (as in the shader). */
const CALM_TIME = 0.4;

/** Seconds each person takes to drop out of a Mexican wave once a goal or a save stops it. */
const WAVE_STOP = 0.25;

/**
 * The Mexican wave `wave` seconds after it started, for someone at `around` along the stands (0..1), as in the
 * shader: how high they're lifted and how far their arms are up. `stopped` is the seconds since a goal or a
 * save stopped it, for this person (null while it goes on): they drop out of it.
 */
export function waveLift(
  wave: number,
  around: number,
  own: number,
  dir: 1 | -1,
  s: CrowdSettings,
  stopped: number | null = null,
): { lift: number; arms: number } {
  const laps = wave / s.waveLap;
  if (laps <= 0 || laps >= s.waveLaps) return { lift: 0, arms: 0 };
  // It comes in from beyond one end and goes out past the other.
  const u = laps % 1;
  const front = -s.waveWidth + (dir > 0 ? u : 1 - u) * (1 + 2 * s.waveWidth);
  let bump = 1 - smoothstep(0, s.waveWidth, Math.abs(around + 0.02 * own - front));
  if (stopped !== null) bump *= 1 - smoothstep(0, WAVE_STOP, stopped);
  return { lift: s.waveRise * bump, arms: bump };
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
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
      uniform float uCrowdClock, uReactAt, uReactEnd, uMood, uJump, uWaveAt, uWaveEnd, uWaveDir, uReactDelay, uGoalShout, uShoutShare;
      uniform float uSaveSulk, uFrownShare, uRestSmile, uJumpTime, uJumpHeight, uWaveLap, uWaveLaps, uWaveWidth;
      uniform float uWaveRise;
      // Where the part moves about, and its kind (Limb) * 16 + the vertex's colour slot (see crowd.ts).
      attribute vec4 aPivot;
      // The face's shape keys (expressions), as made in Blender: how far each one moves this vertex, packed
      // (an O, a frown, a smile, a shout: three numbers each).
      attribute vec4 aFace0, aFace1, aFace2;
      // The person's skin colour, and where they stand along the stands: 0 left near the camera, 1 right.
      attribute vec4 aSkin;
      // The person's hair colour, and how much of a jump they have room for (0..1).
      attribute vec4 aHair;
      float crowdKind, crowdRegion;
      vec3 crowdPivot;
      attribute vec4 aMotion; // phase, speed, how much (1 cheer, 0 move, -1 calm), arms (-1 right, 1 left, 0 both)
      // For a flag bearer: the side of the pole (1 left, -1 right; 0 for everyone else), how far, how often (per
      // second) and from where (0..1) they lift the flag up and down (the same as the flag's own lifting).
      attribute vec4 aHold;
      vec4 crowdFace;
      mat3 crowdRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      mat3 crowdRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 crowdRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
      void main() {`,
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      crowdKind = floor(aPivot.w / 16.0 + 0.01);
      crowdRegion = aPivot.w - crowdKind * 16.0;
      crowdPivot = aPivot.xyz;
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

      // Reacting to the last shot: each person a little sooner or later, all of it easing away once the next
      // shot starts. Their own random numbers come from their phase.
      float crowdR1 = fract(aMotion.x * 7.13 + 0.31);
      float crowdR2 = fract(aMotion.x * 13.71 + 0.57);
      float crowdR3 = fract(aMotion.x * 3.77 + 0.11);
      float crowdSince = uCrowdClock - uReactAt - uReactDelay * crowdR1;
      float crowdOn = smoothstep(0.0, 0.15, crowdSince) * (1.0 - smoothstep(uReactEnd, uReactEnd + 0.4, uCrowdClock));
      // Their faces: shouting (mouth wide open) or grinning after a goal; after a save an "ooh!" (an O),
      // then most frown and a few smile (they're for the keeper). At rest, a faint smile of their own.
      crowdFace = vec4(0.0); // O, frown, smile, shout
      float crowdReacting = 0.0;
      if (uMood == ${Mood.Goal}.0) {
        crowdReacting = crowdOn * (1.0 - smoothstep(uGoalShout, uGoalShout + 0.4, crowdSince));
        if (crowdR2 < uShoutShare) crowdFace.w = crowdReacting * (0.75 + 0.25 * sin(crowdSince * 15.0 + aMotion.x * 40.0));
        else crowdFace.z = crowdReacting;
      } else if (uMood == ${Mood.Save}.0) {
        float crowdAfter = smoothstep(0.5, 0.8, crowdSince);
        crowdReacting = crowdOn * (1.0 - smoothstep(uSaveSulk, uSaveSulk + 0.4, crowdSince));
        crowdFace.x = crowdReacting * (1.0 - crowdAfter);
        if (crowdR2 < uFrownShare) crowdFace.y = crowdReacting * crowdAfter;
        else if (crowdR2 > 0.9) crowdFace.z = crowdReacting * crowdAfter;
      }
      crowdFace.z = max(crowdFace.z, uRestSmile * crowdR3 * (1.0 - crowdReacting));
      // A Mexican wave going round the stands, until a goal or a save stops it: then each person drops out of it
      // as they react. Flag bearers keep still.
      float crowdLift = 0.0;
      float crowdPartyArms = 0.0;
      float crowdLaps = (uCrowdClock - uWaveAt) / uWaveLap;
      if (crowdLaps > 0.0 && crowdLaps < uWaveLaps) {
        float crowdU = fract(crowdLaps);
        float crowdFront = -uWaveWidth + (uWaveDir > 0.0 ? crowdU : 1.0 - crowdU) * (1.0 + 2.0 * uWaveWidth);
        float crowdBump = 1.0 - smoothstep(0.0, uWaveWidth, abs(aSkin.w + 0.02 * crowdR3 - crowdFront));
        crowdBump *= (1.0 - crowdHolds) * (1.0 - smoothstep(0.0, ${WAVE_STOP.toFixed(2)}, uCrowdClock - uWaveEnd - uReactDelay * crowdR1));
        crowdLift = uWaveRise * crowdBump;
        crowdPartyArms = crowdBump;
        crowdFace.w = max(crowdFace.w, crowdBump); // shouting as it passes
      }
      // A goal: everyone jumps, arms up, until they calm down (the next shot), easing out of it.
      if (uJump > 0.0 && crowdSince > 0.0 && uCrowdClock < uReactEnd + 0.4) {
        float crowdJumpOn = (1.0 - crowdHolds) * (1.0 - smoothstep(uReactEnd, uReactEnd + 0.4, uCrowdClock));
        float crowdU = fract(crowdSince / uJumpTime);
        crowdLift += crowdJumpOn * uJumpHeight * (0.6 + 0.4 * crowdR3) * 4.0 * crowdU * (1.0 - crowdU);
        crowdPartyArms = max(crowdPartyArms, crowdJumpOn * smoothstep(0.0, 0.1, crowdSince));
      }
      crowdLift *= aHair.w;
      if (crowdKind == 1.0 && aHold.x * crowdPivot.x > 0.0) {
        crowdLimb = crowdRotX(-uHoldForward) * crowdRotZ(sign(crowdPivot.x) * uHoldRaise);
      } else if (crowdKind == 1.0) {
        float crowdUp = aMotion.w == 0.0 || aMotion.w * crowdPivot.x > 0.0 ? max(crowdCheer, crowdPartyArms) : crowdPartyArms;
        crowdLimb = crowdRotX(-uArmForward * crowdUp) * crowdRotZ(sign(crowdPivot.x) * uArmRaise * crowdUp);
      } else if (crowdKind == 2.0) {
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
      transformed += aFace0.xyz * crowdFace.x + vec3(aFace0.w, aFace1.xy) * crowdFace.y
        + vec3(aFace1.zw, aFace2.x) * crowdFace.z + aFace2.yzw * crowdFace.w;
      transformed = crowdBody * (crowdLimb * (transformed - crowdPivot) + crowdPivot) + vec3(0.0, crowdBob + crowdLift, 0.0);`,
    );
}

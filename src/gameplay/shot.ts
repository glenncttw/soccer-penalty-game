import type { Vec3 } from '../physics/ballForces';
import { strikeQuality, type StrikeQuality } from './power';

export interface ShotInput {
  /** Where the player aimed, on the goal plane. */
  aim: Vec3;
  /** 0..1 from the power meter. */
  power: number;
  /** -1 (bend left) .. 1 (bend right), from the sideways drag. */
  curl: number;
}

export interface Shot {
  target: Vec3;
  speed: number;
  spin: Vec3;
  quality: StrikeQuality;
}

const MAX_CURL_SPIN = 55; // rad/s

/** Turns raw player input into the shot that will actually be struck. */
export function shapeShot(input: ShotInput, random: () => number = Math.random): Shot {
  const { aim, power, curl } = input;
  const quality = strikeQuality(power);
  const target = { ...aim };

  // Aim wobble grows the further the release is from the gold zone.
  const wobble = quality === 'perfect' ? 0 : quality === 'good' ? 0.35 : 0.6;
  target.x += (random() * 2 - 1) * wobble;
  target.y += (random() * 2 - 1) * wobble * 0.5;

  if (quality === 'skied') target.y += 1.2 + (power - 0.92) * 15;
  if (quality === 'weak') target.y = Math.max(0.15, target.y - (0.5 - power) * 2);
  target.y = Math.max(0.15, target.y);

  const speed = 12 + power * 17 + (quality === 'perfect' ? 3 : 0);
  // Positive curl bends right; spin around -y does that for a ball heading to -z.
  const spin = { x: 0, y: -curl * MAX_CURL_SPIN, z: 0 };
  return { target, speed, spin, quality };
}

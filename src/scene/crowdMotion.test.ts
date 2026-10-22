import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CROWD_SETTINGS } from './crowdSettings';
import { jumpLift, Limb, limbAt, reachablePoses, waveLift } from './crowdMotion';

describe('crowd motion', () => {
  it('tells the parts apart by where their origin is', () => {
    expect(limbAt(new THREE.Vector3(0, 0, 0))).toBe(Limb.Body);
    expect(limbAt(new THREE.Vector3(0.135, 0.48, -0.01))).toBe(Limb.Arm);
    expect(limbAt(new THREE.Vector3(-0.135, 0.48, -0.01))).toBe(Limb.Arm);
    expect(limbAt(new THREE.Vector3(0, 0.55, 0.02))).toBe(Limb.Head);
  });

  it('measures a cheering arm all the way up, past the side, and a calm one hanging', () => {
    const shoulder = new THREE.Vector3(0.135, 0.48, 0);
    const hand = new THREE.Vector3(0.135, 0.2, 0);
    const top = (poses: THREE.Matrix4[]) => Math.max(...poses.map((m) => hand.clone().applyMatrix4(m).y));
    const out = (poses: THREE.Matrix4[]) => Math.max(...poses.map((m) => hand.clone().applyMatrix4(m).x));
    const cheer = reachablePoses(Limb.Arm, shoulder, CROWD_SETTINGS, 'cheer');
    expect(top(cheer)).toBeGreaterThan(shoulder.y + 0.2);
    expect(out(cheer)).toBeGreaterThan(shoulder.x + 0.2);
    expect(top(reachablePoses(Limb.Arm, shoulder, CROWD_SETTINGS, 'calm'))).toBeLessThan(
      0.2 + CROWD_SETTINGS.bob + 1e-6,
    );
  });

  it('keeps calm people facing the way they were put', () => {
    const nose = new THREE.Vector3(0, 0.7, 0.2);
    for (const m of reachablePoses(Limb.Head, new THREE.Vector3(0, 0.55, 0), CROWD_SETTINGS, 'calm')) {
      const p = nose.clone().applyMatrix4(m);
      expect(p.x).toBeCloseTo(0);
      expect(p.z).toBeCloseTo(0.2);
    }
  });

  it('jumps a few times after a goal, arms up, and lands back on the step', () => {
    const s = CROWD_SETTINGS;
    const at = (t: number, own = 1) => jumpLift(t, own, s);
    const jumping = s.jumps * s.jumpTime;
    expect(at(0).lift).toBe(0);
    expect(at(s.jumpTime / 2).lift).toBeCloseTo(s.jumpHeight);
    expect(at(s.jumpTime / 2, 0).lift).toBeCloseTo(s.jumpHeight * 0.6);
    expect(at(s.jumpTime * 1.5).arms).toBe(1);
    for (let t = 0; t < jumping + 1; t += 0.01) expect(at(t).lift).toBeGreaterThanOrEqual(0);
    expect(at(jumping + 0.01)).toEqual({ lift: 0, arms: 0 });
  });

  it('sends a Mexican wave along the stands, each person up as it passes them', () => {
    const s = CROWD_SETTINGS;
    // When the wave (going right) is fullest at `around`, within its first lap.
    const peak = (around: number, dir: 1 | -1) => {
      let best = 0;
      let when = 0;
      for (let t = 0; t < s.waveLap; t += 0.005) {
        const { lift } = waveLift(t, around, 0, dir, s);
        if (lift > best) [best, when] = [lift, t];
      }
      return { best, when };
    };
    expect(peak(0.2, 1).best).toBeCloseTo(s.waveRise, 2);
    expect(peak(0.8, 1).when).toBeGreaterThan(peak(0.2, 1).when + s.waveLap * 0.5);
    expect(peak(0.8, -1).when).toBeLessThan(peak(0.2, -1).when);
    // Far from the wave, nobody moves; after its last lap, nobody at all.
    expect(waveLift(s.waveLap * 0.2, 0.9, 0, 1, s).lift).toBe(0);
    expect(waveLift(s.waveLap * s.waveLaps + 0.01, 0.5, 0, 1, s).lift).toBe(0);
  });

  it('lets a goal or a save stop the Mexican wave: people drop out of it quickly', () => {
    const s = CROWD_SETTINGS;
    // Someone the wave is passing right now.
    let t = 0;
    while (waveLift(t, 0.3, 0, 1, s).lift < s.waveRise * 0.99) t += 0.005;
    expect(waveLift(t, 0.3, 0, 1, s, 0).lift).toBeCloseTo(s.waveRise, 2);
    expect(waveLift(t + 0.1, 0.3, 0, 1, s, 0.1).lift).toBeGreaterThan(0);
    expect(waveLift(t + 0.3, 0.3, 0, 1, s, 0.3)).toEqual({ lift: 0, arms: 0 });
  });
});

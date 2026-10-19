import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CROWD_SETTINGS } from './crowdSettings';
import { Limb, limbAt, reachablePoses } from './crowdMotion';

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
    expect(top(reachablePoses(Limb.Arm, shoulder, CROWD_SETTINGS, 'calm'))).toBeLessThan(0.2 + CROWD_SETTINGS.bob + 1e-6);
  });

  it('keeps calm people facing the way they were put', () => {
    const nose = new THREE.Vector3(0, 0.7, 0.2);
    for (const m of reachablePoses(Limb.Head, new THREE.Vector3(0, 0.55, 0), CROWD_SETTINGS, 'calm')) {
      const p = nose.clone().applyMatrix4(m);
      expect(p.x).toBeCloseTo(0);
      expect(p.z).toBeCloseTo(0.2);
    }
  });
});

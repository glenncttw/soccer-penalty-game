import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BallTrail, trailStyle } from './ball';

describe('ball trail', () => {
  it('is wider and longer for harder and perfect strikes', () => {
    const soft = trailStyle(0.3, false);
    const hard = trailStyle(0.9, false);
    const perfect = trailStyle(0.87, true);
    expect(hard.width).toBeGreaterThan(soft.width);
    expect(hard.life).toBeGreaterThan(soft.life);
    expect(perfect.width).toBeGreaterThan(hard.width);
    expect(perfect.life).toBeGreaterThan(hard.life);
  });

  it('covers the same stretch of time at any frame rate', () => {
    const camera = new THREE.Vector3(0, 1, 20);
    const drawn = (fps: number) => {
      const trail = new BallTrail();
      trail.setStyle(trailStyle(0.5, false));
      for (let t = 0; t <= 2; t += 1 / fps) {
        trail.push({ x: 0, y: 1, z: -25 * t }, t);
        trail.update(t, camera);
      }
      const segments = trail.mesh.geometry.drawRange.count / 6;
      return segments / fps; // seconds of flight the ribbon spans
    };
    const style = trailStyle(0.5, false);
    expect(drawn(30)).toBeCloseTo(style.life, 1);
    expect(drawn(144)).toBeCloseTo(style.life, 1);
  });
});

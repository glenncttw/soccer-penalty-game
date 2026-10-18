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

  /** Flies a trail straight at `speed` m/s for `seconds`, then returns how long (m) the drawn ribbon is. */
  function fly(trail: BallTrail, fps: number, speed: number, seconds: number, from = 0) {
    const camera = new THREE.Vector3(0, 1, 20);
    for (let t = from; t <= from + seconds; t += 1 / fps) {
      trail.push({ x: 0, y: 1, z: -speed * t }, t);
      trail.update(t, camera);
    }
  }
  const ribbonLength = (trail: BallTrail) => {
    const points = trail.mesh.geometry.drawRange.count / 6 + 1;
    const pos = trail.mesh.geometry.getAttribute('position');
    return points > 1 ? Math.abs(pos.getZ(0) - pos.getZ((points - 1) * 2)) : 0;
  };

  it('keeps its whole length on a fast perfect shot at a high frame rate', () => {
    const trail = new BallTrail();
    const style = trailStyle(0.87, true);
    trail.setStyle(style);
    fly(trail, 240, 35, 2);
    expect(ribbonLength(trail)).toBeGreaterThan(35 * style.life * 0.95);
  });

  it('stops growing at a touch and pulls itself in', () => {
    const trail = new BallTrail();
    trail.setStyle(trailStyle(0.87, true));
    const camera = new THREE.Vector3(0, 1, 20);
    fly(trail, 60, 25, 1);
    trail.stop(1);
    trail.push({ x: 0, y: 1, z: -40 }, 1.05); // the ball moves on, the trail doesn't
    trail.update(1.1, camera);
    const pos = trail.mesh.geometry.getAttribute('position');
    expect(pos.getZ(0)).toBeGreaterThan(-26);
    trail.update(1.31, camera);
    expect(trail.mesh.geometry.drawRange.count).toBe(0); // gone within 0.3 s
    trail.clear();
    fly(trail, 60, 25, 0.5, 2); // and follows the next shot again
    expect(trail.mesh.geometry.drawRange.count).toBeGreaterThan(0);
  });

  it('fades in at its back end right after the kick', () => {
    const trail = new BallTrail();
    trail.setStyle(trailStyle(0.87, true));
    fly(trail, 60, 25, 0.15); // a fresh trail: every point is still young
    const alpha = trail.mesh.geometry.getAttribute('alpha');
    const last = trail.mesh.geometry.drawRange.count / 6; // the oldest point, at the kick
    expect(alpha.getX(last * 2)).toBe(0);
    expect(alpha.getX(Math.floor(last / 2) * 2)).toBeGreaterThan(0.5);
  });
});

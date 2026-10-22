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

  it('after a touch, keeps following the ball while its back end shoots forward to the front', () => {
    const trail = new BallTrail();
    trail.setStyle(trailStyle(0.87, true));
    const camera = new THREE.Vector3(0, 1, 20);
    fly(trail, 60, 25, 1);
    const pos = trail.mesh.geometry.getAttribute('position');
    const alpha = trail.mesh.geometry.getAttribute('alpha');
    /** Where the furthest-back point that still shows is, along z. */
    const backZ = () => {
      const points = trail.mesh.geometry.drawRange.count / 6 + 1;
      let last = 0;
      for (let i = 0; i < points; i++) if (alpha.getX(i * 2) > 0.01) last = i;
      return pos.getZ(last * 2);
    };
    const before = backZ();
    trail.stop(1);
    let ball = -25;
    const step = (to: number) => {
      for (let t = 1; t <= to + 1e-9; t += 1 / 60) {
        ball -= 3 / 60; // the ball rolls on slowly in the net
        trail.push({ x: 0, y: 1, z: ball }, t);
        trail.update(t, camera);
      }
    };
    step(1.05);
    const first = backZ();
    expect(Math.abs(pos.getZ(0) - ball)).toBeLessThan(0.1); // the front is still at the ball
    step(1.1);
    const second = backZ();
    expect(first).toBeLessThan(before); // the back moves forward (toward -z) at once
    expect(before - first).toBeGreaterThan(first - second); // fastest right away, no slow start
    step(1.26);
    expect(trail.mesh.geometry.drawRange.count).toBe(0); // gone within 0.25 s
    step(1.5);
    expect(trail.mesh.geometry.drawRange.count).toBe(0); // and stays gone while the ball moves on
    trail.clear();
    fly(trail, 60, 25, 0.5, 2); // until the next shot
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

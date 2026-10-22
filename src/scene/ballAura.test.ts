import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BallAura } from './ballAura';

describe('ball aura', () => {
  const ball = new THREE.Object3D();
  ball.position.set(1, 2, 3);

  it('only glows on a perfect strike', () => {
    const aura = new BallAura(0.175);
    aura.begin(false);
    aura.update(ball, true, 1, 0.5);
    expect(aura.mesh.visible).toBe(false);
    aura.begin(true);
    aura.update(ball, true, 1, 0.5);
    expect(aura.mesh.visible).toBe(true);
    expect(aura.mesh.position.toArray()).toEqual([1, 2, 3]);
  });

  it('goes out softly once the shot is over, and with the ball fading out', () => {
    const aura = new BallAura(0.175);
    aura.begin(true);
    aura.update(ball, true, 1, 0.5);
    aura.update(ball, false, 1, 0.1);
    const level = () => aura.mesh.material.uniforms.uLevel.value as number;
    expect(level()).toBeGreaterThan(0);
    expect(level()).toBeLessThan(1);
    aura.update(ball, false, 1, 1);
    expect(aura.mesh.visible).toBe(false);
    aura.begin(true);
    aura.update(ball, true, 0.5, 0.5);
    expect(level()).toBeCloseTo(0.5);
  });
});

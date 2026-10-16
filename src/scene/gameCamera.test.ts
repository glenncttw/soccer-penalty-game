import { describe, expect, it } from 'vitest';
import type { WorldConfig } from '../worldConfig';
import { createGameCamera, type CameraState } from './gameCamera';

const world = {
  goal: { lineZ: 0, outerHalfWidth: 3 },
  camera: { position: { x: 0, y: 0.94, z: 16.03 }, quaternion: { x: -0.014, y: 0, z: 0, w: Math.sqrt(1 - 0.014 ** 2) }, fov: 32.8 },
} as WorldConfig;

const still: CameraState = { charging: false, swayTarget: null };

function settle(view: ReturnType<typeof createGameCamera>, state: CameraState = still, seconds = 3) {
  for (let t = 0; t < seconds; t += 1 / 60) view.update(1 / 60, state);
}

describe('game camera', () => {
  it('rests exactly at the Blender camera', () => {
    const view = createGameCamera(world);
    view.fit(16 / 9);
    settle(view);
    expect(view.camera.position.toArray()).toEqual([0, 0.94, 16.03]);
    expect(view.camera.fov).toBeCloseTo(32.8);
  });

  it('pushes in while charging and goes back after', () => {
    const view = createGameCamera(world);
    view.fit(16 / 9);
    settle(view, { charging: true, swayTarget: null });
    expect(view.camera.position.z).toBeLessThan(16.03 - 0.4);
    expect(view.camera.fov).toBeLessThan(32.8);
    settle(view);
    expect(view.camera.position.z).toBeCloseTo(16.03, 3);
    expect(view.camera.fov).toBeCloseTo(32.8, 3);
  });

  it('shakes on impact, then settles', () => {
    const view = createGameCamera(world);
    view.fit(16 / 9);
    const rest = view.camera.quaternion.clone();
    view.addTrauma(1);
    view.update(0.05, still);
    expect(view.camera.quaternion.angleTo(rest)).toBeGreaterThan(0.001);
    settle(view);
    expect(view.camera.quaternion.angleTo(rest)).toBeLessThan(1e-6);
  });

  it('sways around the goal, keeping the goal centre in front', () => {
    const view = createGameCamera(world);
    view.fit(16 / 9);
    settle(view, { charging: false, swayTarget: { x: 1, y: 0 } });
    expect(view.camera.position.x).not.toBeCloseTo(0, 2);
    const forward = view.camera.getWorldDirection(view.camera.position.clone());
    const toGoal = view.camera.position.clone().negate().setY(0).normalize();
    expect(forward.setY(0).normalize().angleTo(toGoal)).toBeLessThan(0.01);
  });

  it('tilts up when the pointer goes up, circling down around the goal', () => {
    const view = createGameCamera(world);
    view.fit(16 / 9);
    const restPitch = view.camera.getWorldDirection(view.camera.position.clone()).y;
    settle(view, { charging: false, swayTarget: { x: 0, y: 1 } });
    expect(view.camera.position.y).toBeLessThan(0.94 - 0.05);
    expect(view.camera.getWorldDirection(view.camera.position.clone()).y).toBeGreaterThan(restPitch + 0.004);
    settle(view, { charging: false, swayTarget: { x: 0, y: -1 } });
    expect(view.camera.position.y).toBeGreaterThan(0.94 + 0.05);
    settle(view, still, 6);
    expect(view.camera.position.y).toBeCloseTo(0.94, 3);
  });
});

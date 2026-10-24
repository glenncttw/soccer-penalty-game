import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WorldConfig } from '../worldConfig';
import type { CameraSettings } from './cameraSettings';
import { cameraSettingsFromBlender, createGameCamera, type CameraState } from './gameCamera';

const world = {
  goal: { lineZ: 0, outerHalfWidth: 3 },
  ballStart: { x: 0, y: 0.175, z: 12.4 },
  groundY: 0,
  camera: { position: { x: 0, y: 0.94, z: 16.03 }, quaternion: { x: -0.014, y: 0, z: 0, w: Math.sqrt(1 - 0.014 ** 2) }, fov: 32.8 },
} as WorldConfig;

// 0.94 m up, 16.03 m from the goal line, looking at 0.47 m on the goal line.
const settings: CameraSettings = { height: 0.94, distanceBehindBall: 3.63, targetHeight: 0.47, fov: 32.8, verticalShift: 0 };

/** Where a point lands on screen, in -1..1 (y up). */
function screen(camera: THREE.PerspectiveCamera, p: THREE.Vector3) {
  camera.updateMatrixWorld();
  return p.clone().project(camera);
}

const still: CameraState = { charging: false, swayTarget: null };

function settle(view: ReturnType<typeof createGameCamera>, state: CameraState = still, seconds = 3) {
  for (let t = 0; t < seconds; t += 1 / 60) view.update(1 / 60, state);
}

describe('game camera', () => {
  it('rests behind the ball, looking at the target on the goal line', () => {
    const view = createGameCamera(world, settings);
    view.fit(16 / 9);
    settle(view);
    expect(view.camera.position.x).toBe(0);
    expect(view.camera.position.y).toBeCloseTo(0.94, 6);
    expect(view.camera.position.z).toBeCloseTo(16.03, 6);
    expect(view.camera.fov).toBeCloseTo(32.8);
    const target = screen(view.camera, new THREE.Vector3(0, 0.47, 0));
    expect(target.x).toBeCloseTo(0, 6);
    expect(target.y).toBeCloseTo(0, 6);
  });

  it('gives back the Blender camera from its settings', () => {
    const fromBlender = cameraSettingsFromBlender(world);
    expect(fromBlender.height).toBeCloseTo(0.94, 6);
    expect(fromBlender.distanceBehindBall).toBeCloseTo(3.63, 6);
    expect(fromBlender.fov).toBe(32.8);
    const view = createGameCamera(world, fromBlender);
    const c = world.camera;
    const blender = new THREE.Quaternion(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).normalize();
    expect(view.camera.quaternion.angleTo(blender)).toBeLessThan(1e-6);
  });

  it('changes to new settings straight away', () => {
    const view = createGameCamera(world, settings);
    view.fit(16 / 9);
    view.setSettings({ ...settings, height: 1.2, distanceBehindBall: 3, fov: 30 });
    expect(view.camera.position.y).toBeCloseTo(1.2, 6);
    expect(view.camera.position.z).toBeCloseTo(15.4, 6);
    expect(view.camera.fov).toBeCloseTo(30);
    settle(view);
    expect(view.camera.position.z).toBeCloseTo(15.4, 6);
  });

  it('slides the picture up without turning the camera', () => {
    const view = createGameCamera(world, settings);
    view.fit(16 / 9);
    const goalLine = new THREE.Vector3(0, 0, 0);
    const before = screen(view.camera, goalLine).y;
    const rotation = view.camera.quaternion.clone();
    view.setSettings({ ...settings, verticalShift: 0.1 });
    expect(view.camera.quaternion.angleTo(rotation)).toBeLessThan(1e-9);
    expect(screen(view.camera, goalLine).y - before).toBeCloseTo(0.2, 6); // 0.1 of the height = 0.2 in -1..1
  });

  it('keeps aiming exact: the pointer on a spot in the goal aims at that spot', () => {
    const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const raycaster = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    for (const s of [settings, { ...settings, height: 1.3, targetHeight: 1, fov: 40, verticalShift: -0.08 }]) {
      const view = createGameCamera(world, s);
      for (const aspect of [16 / 9, 9 / 19.5]) {
        view.fit(aspect);
        settle(view, { charging: false, swayTarget: { x: 0.7, y: -0.4 } });
        for (const spot of [new THREE.Vector3(-2.6, 1.7, 0), new THREE.Vector3(1.5, 0.3, 0)]) {
          const p = screen(view.camera, spot);
          raycaster.setFromCamera(new THREE.Vector2(p.x, p.y), view.camera);
          expect(raycaster.ray.intersectPlane(goalPlane, hit)).not.toBeNull();
          expect(hit.distanceTo(spot)).toBeLessThan(1e-4);
        }
      }
    }
  });

  it('only widens the view on narrow screens when the goal would not fit', () => {
    const view = createGameCamera(world, settings);
    view.fit(4 / 3);
    expect(view.camera.fov).toBeCloseTo(32.8);
    view.fit(9 / 19.5); // a phone held upright
    expect(view.camera.fov).toBeGreaterThan(40);
    const post = screen(view.camera, new THREE.Vector3(3, 1, 0));
    expect(post.x).toBeLessThan(1);
  });

  it('pushes in while charging and goes back after', () => {
    const view = createGameCamera(world, settings);
    view.fit(16 / 9);
    settle(view, { charging: true, swayTarget: null });
    expect(view.camera.position.z).toBeLessThan(16.03 - 0.4);
    expect(view.camera.fov).toBeLessThan(32.8);
    settle(view);
    expect(view.camera.position.z).toBeCloseTo(16.03, 3);
    expect(view.camera.fov).toBeCloseTo(32.8, 3);
  });

  it('shakes on impact, then settles', () => {
    const view = createGameCamera(world, settings);
    view.fit(16 / 9);
    const rest = view.camera.quaternion.clone();
    view.addTrauma(1);
    view.update(0.05, still);
    expect(view.camera.quaternion.angleTo(rest)).toBeGreaterThan(0.001);
    settle(view);
    expect(view.camera.quaternion.angleTo(rest)).toBeLessThan(1e-6);
  });

  it('sways around the goal, keeping the goal centre in front', () => {
    const view = createGameCamera(world, settings);
    view.fit(16 / 9);
    settle(view, { charging: false, swayTarget: { x: 1, y: 0 } });
    expect(view.camera.position.x).not.toBeCloseTo(0, 2);
    const forward = view.camera.getWorldDirection(view.camera.position.clone());
    const toGoal = view.camera.position.clone().negate().setY(0).normalize();
    expect(forward.setY(0).normalize().angleTo(toGoal)).toBeLessThan(0.01);
  });

  it('tilts up when the pointer goes up, circling down around the goal', () => {
    const view = createGameCamera(world, settings);
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

  it('moves in close to the keeper at the end of a round: on the left of a wide screen, at the top of a tall one', () => {
    const keeper = new THREE.Vector3(0, 0, 0.35);
    for (const [aspect, side] of [
      [16 / 9, 'left'],
      [9 / 19, 'top'],
    ] as const) {
      const view = createGameCamera(world, settings, keeper);
      view.fit(aspect);
      settle(view, { ...still, ending: true });
      const feet = screen(view.camera, keeper);
      const head = screen(view.camera, keeper.clone().setY(1.6));
      expect(view.camera.position.z).toBeLessThan(6); // well in front of the penalty spot
      expect(head.y).toBeLessThan(1); // all of it in view
      expect(feet.y).toBeGreaterThan(-1);
      const middle = screen(view.camera, keeper.clone().setY(0.8));
      expect(head.y - feet.y).toBeGreaterThan(side === 'left' ? 0.9 : 0.6); // big, filling much of the height
      if (side === 'left') {
        expect(middle.x).toBeCloseTo(-0.3, 2);
        expect(middle.y).toBeCloseTo(-0.05, 2);
      } else {
        expect(middle.x).toBeCloseTo(0, 2);
        expect(middle.y).toBeCloseTo(0.38, 2);
      }
      // The grass blades stand up as seen from close by too (the spot it drifts round, not the rest view).
      expect(view.grassView.distanceTo(view.camera.position)).toBeLessThan(0.5);
      // And back to the rest view once the screen goes.
      settle(view);
      expect(view.camera.position.z).toBeCloseTo(16.03, 6);
      expect(view.grassView.equals(view.restPosition)).toBe(true);
    }
  });
});

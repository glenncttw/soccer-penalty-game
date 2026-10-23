import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WorldConfig } from '../worldConfig';
import { createGameCamera } from './gameCamera';
import { IntroChips } from './introChips';

function setUp(count = 24) {
  const model = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, 0.7), new THREE.MeshStandardMaterial());
  model.updateMatrixWorld();
  const chips = new IntroChips(model, count);
  const camera = new THREE.PerspectiveCamera(32.5, 16 / 9, 0.05, 400);
  camera.position.set(0, 1.2, 5.8);
  camera.updateMatrixWorld();
  const ball = new THREE.Object3D();
  ball.position.set(0, 1.2, 3.8); // 2 m in front of the camera
  return { chips, camera, ball };
}

/** Each chip's place as seen from the camera, and its size. */
function seen(chips: IntroChips, camera: THREE.PerspectiveCamera) {
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  return Array.from({ length: chips.mesh.count }, (_, i) => {
    chips.mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    const size = Math.hypot(m.elements[0], m.elements[1], m.elements[2]); // decompose can't read a zero size
    return { view: p.clone().applyMatrix4(camera.matrixWorldInverse), size };
  });
}

describe('IntroChips', () => {
  it('makes a tunnel: chips come out deep behind the ball, come toward the camera and leave past the screen edge', () => {
    const { chips, camera, ball } = setUp();
    const ballRadius = 0.175 / 2; // the ball's outline as seen from the camera (2 m away)
    chips.update(1 / 60, camera, ball, 'swirl');
    let before = seen(chips, camera);
    let newOnes = 0;
    for (let i = 0; i < 60 * 12; i++) {
      chips.update(1 / 60, camera, ball, 'swirl');
      const now = seen(chips, camera);
      now.forEach((chip, j) => {
        const was = before[j];
        expect(-chip.view.z).toBeGreaterThan(0.3); // never at the camera (the ball is 2 m away)
        if (-chip.view.z > -was.view.z + 1) {
          // Started again at the back, deep behind the ball, inside its outline (so hidden by it).
          newOnes++;
          expect(-chip.view.z).toBeGreaterThan(5);
          expect(Math.hypot(chip.view.x, chip.view.y) / -chip.view.z).toBeLessThan(ballRadius);
        } else {
          expect(-chip.view.z).toBeLessThan(-was.view.z + 1e-9); // always coming closer
        }
      });
      before = now;
    }
    expect(newOnes).toBeGreaterThan(24); // every chip came round again
  });

  it('never cuts a chip off at the edge: it only starts again once all of it is past the edge of the screen', () => {
    for (const [w, h] of [
      [1440, 800],
      [2560, 1080],
      [390, 844],
      [844, 390],
    ]) {
      const view = createGameCamera({
        goal: { lineZ: 0, outerHalfWidth: 3 },
        ballStart: { x: 0, y: 0.175, z: 12.4 },
        groundY: 0,
      } as WorldConfig);
      view.fit(w / h);
      const { chips, ball } = setUp(40);
      const camera = view.camera;
      camera.position.set(0, 1.2, 5.8);
      camera.quaternion.identity();
      camera.updateMatrixWorld();
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Vector3();
      // Points all over the chip's outer sphere: it is on the screen if any of them is.
      const around = Array.from({ length: 200 }, (_, k) => {
        const z = 1 - (2 * (k + 0.5)) / 200;
        const a = k * 2.39996;
        return new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - z * z), Math.sin(a) * Math.sqrt(1 - z * z), z);
      });
      const visible = (i: number) => {
        chips.mesh.getMatrixAt(i, m);
        const scale = Math.hypot(m.elements[0], m.elements[1], m.elements[2]);
        const reach = (scale * Math.hypot(2, 2.6, 0.7)) / 2 / 2.6; // the test's chip: a 2 x 2.6 x 0.7 box made 1 long
        p.setFromMatrixPosition(m);
        return around.some((d) => {
          q.copy(p).addScaledVector(d, reach).project(camera);
          return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1;
        });
      };
      const depth = (i: number) => {
        chips.mesh.getMatrixAt(i, m);
        return -p.setFromMatrixPosition(m).applyMatrix4(camera.matrixWorldInverse).z;
      };
      chips.update(1 / 60, camera, ball, 'swirl');
      let was = Array.from({ length: 40 }, (_, i) => ({ depth: depth(i), visible: visible(i) }));
      let restarts = 0;
      for (let f = 0; f < 60 * 20; f++) {
        chips.update(1 / 60, camera, ball, 'swirl');
        const now = Array.from({ length: 40 }, (_, i) => ({ depth: depth(i), visible: visible(i) }));
        now.forEach((chip, i) => {
          if (chip.depth > was[i].depth + 1) {
            restarts++;
            expect(was[i].visible, `${w}x${h}`).toBe(false); // it was all off the screen just before
          }
          expect(chip.depth).toBeGreaterThan(camera.near + 0.1);
          expect(Math.abs(chip.depth - 2)).toBeLessThan(20);
        });
        was = now;
      }
      expect(restarts).toBeGreaterThan(40);
    }
  }, 30000); // thousands of frames on four screens

  it('flies off on Speel nu & Win and is gone soon after, then hides', () => {
    const { chips, camera, ball } = setUp();
    chips.update(1 / 60, camera, ball, 'swirl');
    for (let i = 0; i < 60; i++) chips.update(1 / 60, camera, ball, 'burst');
    expect(
      seen(chips, camera)
        .map((c) => c.size)
        .filter((s) => s !== 0),
    ).toEqual([]);
    chips.update(1 / 60, camera, ball, 'off');
    expect(chips.mesh.visible).toBe(false);
  });
});

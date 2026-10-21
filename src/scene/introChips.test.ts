import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
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
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfWidth = halfHeight * camera.aspect;
    const ballRadius = 0.175 / 2; // the ball's outline as seen from the camera (2 m away)
    chips.update(1 / 60, camera, ball, 'swirl');
    let before = seen(chips, camera);
    let newOnes = 0;
    let gone = 0;
    for (let i = 0; i < 60 * 12; i++) {
      chips.update(1 / 60, camera, ball, 'swirl');
      const now = seen(chips, camera);
      now.forEach((chip, j) => {
        const was = before[j];
        expect(-chip.view.z).toBeGreaterThan(0.6); // never at the camera (the ball is 2 m away)
        if (-chip.view.z > -was.view.z + 1) {
          // Started again at the back: just before, it was off the screen.
          gone++;
          const offSide = Math.abs(was.view.x) / -was.view.z > halfWidth;
          const offTop = Math.abs(was.view.y) / -was.view.z > halfHeight;
          expect(offSide || offTop).toBe(true);
          // And it comes out deep behind the ball, inside its outline (so hidden by it).
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
    expect(gone).toBe(newOnes);
  });

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

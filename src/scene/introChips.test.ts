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
  it('swirls round the ball, always in front of the camera, coming out from behind it', () => {
    const { chips, camera, ball } = setUp();
    for (let i = 0; i < 600; i++) {
      chips.update(1 / 60, camera, ball, 'swirl');
      for (const chip of seen(chips, camera)) {
        if (chip.size === 0) continue;
        expect(-chip.view.z).toBeGreaterThanOrEqual(0.8 - 1e-9);
      }
    }
    expect(chips.mesh.visible).toBe(true);
  });

  it('comes out behind the middle of the ball, slowly circles round it and shrinks away inside the screen', () => {
    const { chips, camera, ball } = setUp();
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let before = seen(chips, camera);
    let newOnes = 0;
    for (let i = 0; i < 60 * 12; i++) {
      chips.update(1 / 60, camera, ball, 'swirl');
      const now = seen(chips, camera);
      now.forEach((chip, j) => {
        if (chip.size === 0) return;
        // On screen: never past the top or bottom edge.
        expect(Math.abs(chip.view.y) / -chip.view.z).toBeLessThan(halfHeight);
        if (before[j].size === 0) {
          newOnes++; // just come out: near the middle, behind the ball (2 m away)
          expect(Math.hypot(chip.view.x, chip.view.y)).toBeLessThan(0.1);
          expect(-chip.view.z).toBeGreaterThan(2.3);
        }
      });
      before = now;
    }
    expect(newOnes).toBeGreaterThan(20); // every chip came round again
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

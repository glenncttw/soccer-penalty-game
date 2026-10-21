import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { easeInOutCubic, flightPoint, IntroBall, slotDepth } from './introBall';

const RADIUS = 0.175;
const SPOT = { x: 0, y: RADIUS, z: 12.4 };
const REST = { x: 0, y: 0, z: 0, w: 1 };

function rect(left: number, top: number, width: number, height: number) {
  return { getBoundingClientRect: () => ({ left, top, width, height }) };
}

function setUp(w: number, h: number, fov = 32.5) {
  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.05, 400);
  camera.position.set(0, 0.9, 15.8);
  camera.lookAt(0, 0.9, 0);
  camera.updateMatrixWorld();
  const ball = new THREE.Object3D();
  ball.position.set(SPOT.x, SPOT.y, SPOT.z);
  return { camera, ball, view: rect(0, 0, w, h) };
}

/** How many pixels across the ball looks, and where its middle is on screen. */
function onScreen(ball: THREE.Object3D, camera: THREE.PerspectiveCamera, w: number, h: number) {
  const centre = ball.position.clone().project(camera);
  const depth = ball.position.clone().applyMatrix4(camera.matrixWorldInverse).z * -1;
  const size = (2 * RADIUS * h) / (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  return { x: ((centre.x + 1) / 2) * w, y: ((1 - centre.y) / 2) * h, size };
}

describe('slotDepth', () => {
  it('puts the ball where it looks exactly as big as the slot', () => {
    for (const [h, size, fov] of [
      [720, 240, 32.5],
      [844, 130, 60],
      [1080, 260, 45],
    ]) {
      const depth = slotDepth(RADIUS, size, h, fov);
      const looks = (2 * RADIUS * h) / (2 * depth * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
      expect(looks).toBeCloseTo(size, 6);
    }
  });
});

describe('flight', () => {
  it('starts at the start, ends at the end, and rises in between', () => {
    const from = new THREE.Vector3(0.2, 0.9, 13.6);
    const to = new THREE.Vector3(0, RADIUS, 12.4);
    const out = new THREE.Vector3();
    expect(flightPoint(from, to, 0, 0.3, out).distanceTo(from)).toBe(0);
    expect(flightPoint(from, to, 1, 0.3, out).distanceTo(to)).toBeLessThan(1e-9);
    expect(flightPoint(from, to, 0.5, 0.3, out).y).toBeCloseTo((0.9 + RADIUS) / 2 + 0.3, 6);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

describe('IntroBall', () => {
  it('floats in the middle of its slot, as big as the slot, on wide and upright screens', () => {
    for (const [w, h, fov] of [
      [1280, 720, 32.5],
      [390, 844, 58],
    ]) {
      const { camera, ball, view } = setUp(w, h, fov);
      const intro = new IntroBall(ball, camera, view, RADIUS);
      const slot = rect(w / 2 - 100, h * 0.4, 200, 180); // the ball fits the smaller side
      intro.float(slot);
      intro.update(1 / 60, SPOT, REST);
      const seen = onScreen(ball, camera, w, h);
      expect(seen.x).toBeCloseTo(w / 2, 3);
      expect(seen.y).toBeCloseTo(h * 0.4 + 90, 3);
      expect(seen.size).toBeCloseTo(180, 3);
    }
  });

  it('flies down onto the spot and ends exactly at rest, then lets the round start', () => {
    const { camera, ball, view } = setUp(1280, 720);
    const intro = new IntroBall(ball, camera, view, RADIUS);
    intro.float(rect(540, 260, 200, 200));
    for (let i = 0; i < 120; i++) intro.update(1 / 60, SPOT, REST); // spins a while
    expect(ball.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.1);
    const start = ball.position.clone();

    let touches = 0;
    let done = 0;
    intro.land(
      () => touches++,
      () => done++,
    );
    intro.update(1 / 60, SPOT, REST);
    expect(ball.position.distanceTo(start)).toBeLessThan(1e-6); // the words move away first
    expect(intro.active).toBe(true);
    for (let i = 0; i < 200 && intro.active; i++) intro.update(1 / 60, SPOT, REST);
    expect(intro.active).toBe(false);
    expect(touches).toBe(1);
    expect(done).toBe(1);
    expect(ball.position.distanceTo(new THREE.Vector3(SPOT.x, SPOT.y, SPOT.z))).toBeLessThan(1e-9);
    expect(ball.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  });

  it('rises from the spot back into the slot', () => {
    const { camera, ball, view } = setUp(1280, 720);
    const intro = new IntroBall(ball, camera, view, RADIUS);
    const slot = rect(540, 260, 200, 200);
    intro.float(slot, true);
    intro.update(1 / 60, SPOT, REST);
    expect(ball.position.distanceTo(new THREE.Vector3(SPOT.x, SPOT.y, SPOT.z))).toBeLessThan(0.01);
    for (let i = 0; i < 60; i++) intro.update(1 / 60, SPOT, REST);
    expect(onScreen(ball, camera, 1280, 720).size).toBeCloseTo(200, 3);
    expect(intro.landing).toBe(false);
  });

  it('with reduced motion, stands still and then is simply on the spot', () => {
    const { camera, ball, view } = setUp(1280, 720);
    const intro = new IntroBall(ball, camera, view, RADIUS, true);
    intro.float(rect(540, 260, 200, 200));
    intro.update(1, SPOT, REST);
    expect(ball.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
    let done = false;
    intro.land(
      () => {},
      () => (done = true),
    );
    intro.update(0.4, SPOT, REST);
    expect(done).toBe(true);
    expect(ball.position.z).toBe(SPOT.z);
  });
});

describe('reveal', () => {
  it('is all purple while the ball floats, opens up as it flies, and is gone once it rests', () => {
    const { camera, ball, view } = setUp(1280, 720);
    const intro = new IntroBall(ball, camera, view, RADIUS);
    expect(intro.reveal).toBe(1);
    intro.float(rect(540, 260, 200, 200));
    intro.update(1, SPOT, REST);
    expect(intro.reveal).toBe(0);
    intro.land(
      () => {},
      () => {},
    );
    intro.update(0.1, SPOT, REST);
    expect(intro.reveal).toBe(0); // the words move away first
    let last = 0;
    for (let i = 0; i < 50; i++) {
      intro.update(1 / 60, SPOT, REST);
      expect(intro.reveal).toBeGreaterThanOrEqual(last);
      last = intro.reveal;
    }
    for (let i = 0; i < 200 && intro.active; i++) intro.update(1 / 60, SPOT, REST);
    expect(intro.reveal).toBe(1);
  });

  it('closes again as the ball rises back into the intro', () => {
    const { camera, ball, view } = setUp(1280, 720);
    const intro = new IntroBall(ball, camera, view, RADIUS);
    intro.float(rect(540, 260, 200, 200), true);
    intro.update(1 / 60, SPOT, REST);
    expect(intro.reveal).toBeGreaterThan(0.99);
    for (let i = 0; i < 60; i++) intro.update(1 / 60, SPOT, REST);
    expect(intro.reveal).toBe(0);
  });
});

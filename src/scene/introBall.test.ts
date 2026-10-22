import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WorldConfig } from '../worldConfig';
import { createGameCamera } from './gameCamera';
import { easeInOutCubic, flightPoint, IntroBall, slotDepth } from './introBall';

const RADIUS = 0.175;
const SPOT = { x: 0, y: RADIUS, z: 12.4 };
const REST = { x: 0, y: 0, z: 0, w: 1 };
const world = {
  goal: { lineZ: 0, outerHalfWidth: 3 },
  ballStart: SPOT,
  groundY: 0,
} as WorldConfig;

function rect(left: number, top: number, width: number, height: number) {
  return { getBoundingClientRect: () => ({ left, top, width, height }) };
}

/** The game's own camera on a `w` by `h` screen, the ball on its spot, and a ball slot in the middle. */
function setUp(w: number, h: number, reducedMotion = false) {
  const view = createGameCamera(world);
  view.fit(w / h);
  const ball = new THREE.Object3D();
  ball.position.set(SPOT.x, SPOT.y, SPOT.z);
  const size = Math.min(260, 0.36 * h, 0.64 * w);
  const slot = rect(w / 2 - size / 2, h / 2 - size / 2, size, size);
  const intro = new IntroBall(
    ball,
    view.camera,
    rect(0, 0, w, h),
    RADIUS,
    { position: view.restPosition, quaternion: view.restQuaternion },
    reducedMotion,
  );
  /** One frame, in the same order as the game loop. */
  const frame = (dt = 1 / 60) => {
    intro.advance(dt);
    view.update(dt, { charging: false, swayTarget: null, intro: intro.cameraIntro });
    intro.place(SPOT, REST);
  };
  return { view, camera: view.camera, ball, slot, size, intro, frame };
}

/** How many pixels across the ball looks, where its middle is on screen, and how far in front of the camera. */
function onScreen(ball: THREE.Object3D, camera: THREE.PerspectiveCamera, w: number, h: number) {
  camera.updateMatrixWorld();
  const centre = ball.position.clone().project(camera);
  const depth = -ball.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const size = (2 * RADIUS * h) / (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  return { x: ((centre.x + 1) / 2) * w, y: ((1 - centre.y) / 2) * h, size, depth };
}

const SCREENS = [
  [1280, 720],
  [390, 844],
  [844, 390],
];

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

describe('flight helpers', () => {
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
  it('floats in the middle of the screen, as big as its slot, with the camera close to the goal', () => {
    for (const [w, h] of SCREENS) {
      const { camera, ball, slot, size, intro, frame } = setUp(w, h);
      intro.float(slot);
      frame();
      const seen = onScreen(ball, camera, w, h);
      expect(seen.x).toBeCloseTo(w / 2, 3);
      expect(seen.y).toBeCloseTo(h / 2, 3);
      expect(seen.size).toBeCloseTo(size, 3);
      expect(camera.position.z).toBeLessThan(8); // close to the goal, behind the purple
    }
  });

  it('comes down onto the spot in one smooth curve as the camera pulls back: no zig-zag, no bounce, ending exactly at rest', () => {
    for (const [w, h] of SCREENS) {
      const { view, camera, ball, slot, intro, frame } = setUp(w, h);
      intro.float(slot);
      for (let i = 0; i < 120; i++) frame(); // spins a while
      let done = 0;
      intro.land(() => done++);
      const heights: number[] = [];
      for (let i = 0; i < 400 && intro.active; i++) {
        frame();
        const seen = onScreen(ball, camera, w, h);
        expect(seen.depth).toBeGreaterThan(0.4);
        expect(Math.abs(seen.x - w / 2)).toBeLessThan(w * 0.01); // straight down the middle: no swinging side to side
        expect(Math.abs(seen.y - h / 2)).toBeLessThan(h / 2);
        expect(ball.position.y).toBeGreaterThan(RADIUS - 1e-6);
        heights.push(ball.position.y);
      }
      expect(intro.active).toBe(false);
      expect(done).toBe(1);
      // No hop at the end: on the last tenth of the way it only comes down.
      const last = heights.slice(Math.floor(heights.length * 0.9));
      for (let i = 1; i < last.length; i++) expect(last[i]).toBeLessThanOrEqual(last[i - 1] + 1e-9);
      expect(ball.position.distanceTo(new THREE.Vector3(SPOT.x, SPOT.y, SPOT.z))).toBeLessThan(1e-9);
      expect(ball.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
      expect(camera.position.distanceTo(view.restPosition)).toBeLessThan(1e-9); // and the camera is back
      expect(intro.cameraIntro).toBe(0);
    }
  });

  it('swings into the tunnel and back out toward you in one smooth curve, only ever rolling forward', () => {
    for (const [w, h] of SCREENS) {
      const { camera, ball, slot, intro, frame } = setUp(w, h);
      intro.float(slot);
      for (let i = 0; i < 90; i++) frame();
      const start = onScreen(ball, camera, w, h);
      intro.land(() => {});
      // The ball's turn (from how it rests) is always round the line across the screen (x).
      const rolled = (q: THREE.Quaternion) => {
        expect(Math.hypot(q.y, q.z)).toBeLessThan(1e-9);
        return 2 * Math.atan2(q.x, q.w);
      };
      const dt = 1 / 240;
      let last = rolled(ball.quaternion);
      let lastPosition = ball.position.clone();
      let lastVelocity = new THREE.Vector3();
      let deepest = start.depth;
      let deepestAt = 0;
      let nearest = Infinity;
      let biggestKick = 0;
      for (let i = 1; i < 1000 && intro.active; i++) {
        frame(dt);
        const now = onScreen(ball, camera, w, h);
        if (i * dt < 0.6 && now.depth > deepest) [deepest, deepestAt] = [now.depth, i * dt];
        if (i * dt > deepestAt && i * dt < 1.5) nearest = Math.min(nearest, now.depth);
        if (intro.windingUp) {
          // Nothing else has started yet, and it stays about in the middle of the screen.
          expect(intro.reveal).toBe(0);
          expect(Math.hypot(now.x - start.x, now.y - start.y)).toBeLessThan(0.05 * h);
        }
        // No jumps and no kinks: its speed changes only a little from one moment to the next.
        const velocity = ball.position.clone().sub(lastPosition).divideScalar(dt);
        if (i > 1 && intro.active) biggestKick = Math.max(biggestKick, velocity.distanceTo(lastVelocity));
        const angle = rolled(ball.quaternion);
        const step = THREE.MathUtils.euclideanModulo(angle - last + Math.PI, 2 * Math.PI) - Math.PI;
        expect(step).toBeGreaterThan(-1e-9); // forward only
        last = angle;
        lastPosition = ball.position.clone();
        lastVelocity = velocity;
      }
      expect(deepest).toBeGreaterThan(start.depth * 1.3); // first clearly deeper into the tunnel
      expect(deepestAt).toBeGreaterThan(0.25);
      expect(deepestAt).toBeLessThan(0.5);
      expect(nearest).toBeLessThan(start.depth); // then back out, closer to you than where it floated
      expect(biggestKick).toBeLessThan(0.5); // metres a second, between samples 1/240 s apart: no sudden starts
      expect(ball.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
    }
  });

  it('rises from the spot back into the slot', () => {
    const { camera, ball, slot, size, intro, frame } = setUp(1280, 720);
    intro.float(slot, true);
    frame();
    expect(ball.position.distanceTo(new THREE.Vector3(SPOT.x, SPOT.y, SPOT.z))).toBeLessThan(0.01);
    for (let i = 0; i < 60; i++) frame();
    expect(onScreen(ball, camera, 1280, 720).size).toBeCloseTo(size, 3);
    expect(intro.landing).toBe(false);
  });

  it('with reduced motion, stands still, keeps the camera where you shoot from, then is simply on the spot', () => {
    const { view, camera, ball, slot, intro, frame } = setUp(1280, 720, true);
    intro.float(slot);
    for (let i = 0; i < 60; i++) frame();
    expect(ball.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
    expect(camera.position.distanceTo(view.restPosition)).toBeLessThan(1e-9);
    let done = false;
    intro.land(() => (done = true));
    frame(0.4);
    expect(done).toBe(true);
    expect(ball.position.z).toBe(SPOT.z);
  });
});

describe('reveal', () => {
  it('is all purple while the ball floats, opens up as it flies, and is gone once it rests', () => {
    const { slot, intro, frame } = setUp(1280, 720);
    expect(intro.reveal).toBe(1);
    intro.float(slot);
    frame();
    expect(intro.reveal).toBe(0);
    intro.land(() => {});
    while (intro.windingUp) frame();
    frame();
    expect(intro.reveal).toBeGreaterThan(0); // opens up as soon as the ball shoots out, with the chips
    let last = 0;
    for (let i = 0; i < 50; i++) {
      frame();
      expect(intro.reveal).toBeGreaterThanOrEqual(last);
      last = intro.reveal;
    }
    for (let i = 0; i < 200 && intro.active; i++) frame();
    expect(intro.reveal).toBe(1);
  });

  it('closes again as the ball rises back into the intro', () => {
    const { slot, intro, frame } = setUp(1280, 720);
    intro.float(slot, true);
    frame();
    expect(intro.reveal).toBeGreaterThan(0.99);
    for (let i = 0; i < 60; i++) frame();
    expect(intro.reveal).toBe(0);
  });
});

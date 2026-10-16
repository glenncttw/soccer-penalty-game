import * as THREE from 'three';
import { PENALTY_SPOT_Z } from './dimensions';
import { createPhysicsWorld, FIXED_STEP } from './physics/world';
import { BallTrail, createBallMesh } from './scene/ball';
import { createGoal } from './scene/goal';
import { createPitch } from './scene/pitch';
import { createStadium } from './scene/stadium';
import { palette } from './theme';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.sky);
scene.fog = new THREE.Fog(palette.sky, 80, 220);

// First-person view from just behind the ball, goal dead center.
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
camera.position.set(0, 1.5, PENALTY_SPOT_Z + 3.2);
camera.lookAt(0, 1.1, 0);

// Bright, sunny light with soft, blue-tinted shadows.
scene.add(new THREE.HemisphereLight(0xcfeeff, palette.grass, 1.4));
const sun = new THREE.DirectionalLight(0xfff6e0, 2.2);
sun.position.set(-20, 40, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 120 });
sun.shadow.radius = 4;
scene.add(sun);

scene.add(createPitch(), createGoal(), createStadium());

const ballMesh = createBallMesh();
const trail = new BallTrail();
scene.add(ballMesh, trail.mesh);

const physics = await createPhysicsWorld();

// Test shot: a curled kick toward a random spot in the goal, to try out physics and curl.
let shotTimer = -1;
function testShot() {
  physics.resetBall();
  trail.clear();
  const curl = (Math.random() * 2 - 1) * 45; // rad/s around the vertical axis
  const aimX = (Math.random() * 2 - 1) * 2.5 + curl * 0.04;
  const aimY = 0.3 + Math.random() * 1.6;
  const dir = new THREE.Vector3(aimX, aimY + 0.9, -PENALTY_SPOT_Z).normalize().multiplyScalar(24);
  physics.kick(dir, { x: -20, y: curl, z: 0 });
  shotTimer = 3.5;
}
canvas.addEventListener('pointerdown', testShot);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep the whole goal mouth in view on narrow phone screens.
  camera.fov = w / h < 1 ? 50 + (1 - w / h) * 30 : 50;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
let accumulator = 0;
const tmp = new THREE.Vector3();

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  accumulator += dt;
  while (accumulator >= FIXED_STEP) {
    physics.step();
    accumulator -= FIXED_STEP;
  }

  const p = physics.ball.translation();
  const q = physics.ball.rotation();
  ballMesh.position.set(p.x, p.y, p.z);
  ballMesh.quaternion.set(q.x, q.y, q.z, q.w);
  if (shotTimer > 0) {
    trail.push(tmp.set(p.x, p.y, p.z));
    shotTimer -= dt;
    if (shotTimer <= 0) {
      physics.resetBall();
      trail.clear();
    }
  }

  renderer.render(scene, camera);
});

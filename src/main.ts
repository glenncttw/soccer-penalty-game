import * as THREE from 'three';
import { BALL_RADIUS, GOAL_HEIGHT, GOAL_WIDTH, PENALTY_SPOT_Z } from './dimensions';
import { OutcomeTracker } from './gameplay/outcome';
import { PowerMeter } from './gameplay/power';
import { shapeShot } from './gameplay/shot';
import { ShootInput } from './input/shootInput';
import { FIXED_STEP, solveKick } from './physics/flight';
import { createPhysicsWorld } from './physics/world';
import { AimMarkers } from './scene/aimMarkers';
import { BallTrail, createBallMesh } from './scene/ball';
import { createGoal } from './scene/goal';
import { createPitch } from './scene/pitch';
import { createStadium } from './scene/stadium';
import { palette } from './theme';
import { Hud } from './ui/hud';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.sky);
scene.fog = new THREE.Fog(palette.sky, 80, 220);

// First-person view from behind the ball. The camera sits a bit higher and looks
// down the pitch so the goal sits high on screen, leaving room to aim and drag.
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
camera.position.set(0, 2.1, PENALTY_SPOT_Z + 4.2);
camera.lookAt(0, 0.5, 2.5);

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
const markers = new AimMarkers();
scene.add(ballMesh, trail.mesh, markers.group);

const physics = await createPhysicsWorld();
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
const input = new ShootInput(canvas);
const power = new PowerMeter();
const outcome = new OutcomeTracker();

const BALL_START = { x: 0, y: BALL_RADIUS, z: PENALTY_SPOT_Z };
type Phase = 'aiming' | 'charging' | 'flight' | 'result';
let phase: Phase = 'aiming';
let phaseTime = 0;
const aim = new THREE.Vector3(0, 1.2, 0);
let lastQuality = '';

// Pointer → point on the goal plane (z = 0), kept within reach of the goal.
const raycaster = new THREE.Raycaster();
const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
function updateAim() {
  raycaster.setFromCamera(new THREE.Vector2(input.pointer.x, input.pointer.y), camera);
  if (!raycaster.ray.intersectPlane(goalPlane, aim)) return;
  aim.x = THREE.MathUtils.clamp(aim.x, -GOAL_WIDTH / 2 - 1.5, GOAL_WIDTH / 2 + 1.5);
  aim.y = THREE.MathUtils.clamp(aim.y, 0.2, GOAL_HEIGHT + 1.2);
}

function setPhase(next: Phase) {
  phase = next;
  phaseTime = 0;
}

input.onPress = () => {
  updateAim();
  power.reset();
  hud.hideHint();
  setPhase('charging');
};

input.onRelease = () => {
  if (phase !== 'charging') return;
  const shot = shapeShot({ aim, power: power.value, curl: input.curl });
  const velocity = solveKick(BALL_START, shot.target, shot.speed, shot.spin);
  physics.kick(velocity, shot.spin);
  outcome.reset();
  trail.clear();
  markers.hide();
  hud.showPower(null);
  input.enabled = false;
  lastQuality = shot.quality;
  setPhase('flight');
};

function showResult() {
  const goal = outcome.result === 'goal';
  if (goal) {
    const perfect = lastQuality === 'perfect';
    hud.showBanner('GOAL!', outcome.hitFrame ? 'in off the woodwork' : perfect ? 'perfect strike' : '', perfect);
  } else if (outcome.hitFrame) {
    hud.showBanner('WOODWORK!', 'so close');
  } else {
    hud.showBanner('MISS!', lastQuality === 'skied' ? 'too much power' : lastQuality === 'weak' ? 'not enough power' : '');
  }
  setPhase('result');
}

function resetShot() {
  physics.resetBall();
  trail.clear();
  hud.hideBanner();
  input.enabled = true;
  setPhase('aiming');
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Widen the view on narrow phone screens so the whole goal fits.
  camera.fov = w / h < 1 ? 50 + (1 - w / h) * 34 : 50;
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
  phaseTime += dt;

  if (phase === 'aiming') {
    if (input.hasPointer) {
      updateAim();
      markers.showReticle(aim, false);
    } else {
      markers.hide();
    }
  } else if (phase === 'charging') {
    power.update(dt);
    hud.showPower(power.value);
    markers.showReticle(aim, true);
    const preview = shapeShot({ aim, power: 0.87, curl: input.curl }, () => 0.5);
    markers.showPreview(BALL_START, solveKick(BALL_START, preview.target, preview.speed, preview.spin), preview.spin);
    if (power.sweeps >= 2) input.forceRelease(); // don't let a charge last forever
  }

  accumulator += dt;
  while (accumulator >= FIXED_STEP) {
    physics.step();
    accumulator -= FIXED_STEP;
  }

  const p = physics.ball.translation();
  const q = physics.ball.rotation();
  ballMesh.position.set(p.x, p.y, p.z);
  ballMesh.quaternion.set(q.x, q.y, q.z, q.w);

  if (phase === 'flight') {
    trail.push(tmp.set(p.x, p.y, p.z));
    const v = physics.ball.linvel();
    if (outcome.update(p, Math.hypot(v.x, v.y, v.z), dt)) showResult();
  } else if (phase === 'result') {
    if (phaseTime < 0.8) trail.push(tmp.set(p.x, p.y, p.z));
    if (phaseTime > 1.8) resetShot();
  }

  renderer.render(scene, camera);
});

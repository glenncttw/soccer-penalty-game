import * as THREE from 'three';
import { OutcomeTracker } from './gameplay/outcome';
import { PowerMeter } from './gameplay/power';
import { shapeShot } from './gameplay/shot';
import { ShootInput } from './input/shootInput';
import { FIXED_STEP, solveKick } from './physics/flight';
import { createPhysicsWorld } from './physics/world';
import { AimMarkers } from './scene/aimMarkers';
import { BallTrail } from './scene/ball';
import { createGameCamera } from './scene/gameCamera';
import { setUpLighting } from './scene/lighting';
import { loadStadium } from './scene/stadiumAsset';
import { Hud } from './ui/hud';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// The stadium was lit with Blender's "Standard" view transform: plain sRGB, no tone mapping.
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();

// The Blender stadium is the whole environment: pitch, goal, stands, ball and sun.
const stadium = await loadStadium();
const world = stadium.config;
scene.add(stadium.environment);
setUpLighting(scene, stadium.sun);

// The gameplay camera designed in Blender: ball low in the foreground, goal centred.
const { camera, fit: fitCamera } = createGameCamera(world);

const ballMesh = stadium.ball;
const trail = new BallTrail();
const markers = new AimMarkers();
scene.add(ballMesh, trail.mesh, markers.group);

const physics = await createPhysicsWorld(world);
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
const input = new ShootInput(canvas);
const power = new PowerMeter();
const outcome = new OutcomeTracker(world.goal, world.ballRadius);

const BALL_START = world.ballStart;
type Phase = 'aiming' | 'charging' | 'flight' | 'result';
let phase: Phase = 'aiming';
let phaseTime = 0;
const aim = new THREE.Vector3(0, 1.2, world.goal.lineZ);
let lastQuality = '';

// Pointer → point on the goal plane, kept within reach of the goal.
const raycaster = new THREE.Raycaster();
const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -world.goal.lineZ);
function updateAim() {
  raycaster.setFromCamera(new THREE.Vector2(input.pointer.x, input.pointer.y), camera);
  if (!raycaster.ray.intersectPlane(goalPlane, aim)) return;
  const reachX = world.goal.outerHalfWidth + 1.5;
  aim.x = THREE.MathUtils.clamp(aim.x, -reachX, reachX);
  aim.y = THREE.MathUtils.clamp(aim.y, world.groundY + 0.2, world.goal.outerHeight + 1.2);
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
  const shot = shapeShot({ aim, power: power.value, curl: input.curl, minTargetY: world.ballRadius });
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
  fitCamera(w / h);
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
    const preview = shapeShot({ aim, power: 0.87, curl: input.curl, minTargetY: world.ballRadius }, () => 0.5);
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

import * as THREE from 'three';
import { Sound } from './audio/sound';
import { connectFeedback } from './feedback';
import { GameEvents } from './gameplay/events';
import { OutcomeTracker } from './gameplay/outcome';
import { createPowerMeter, PERFECT_MAX, PERFECT_MIN, type StrikeQuality } from './gameplay/power';
import { Score } from './gameplay/score';
import { shapeShot } from './gameplay/shot';
import { SlowMotion } from './gameplay/slowMotion';
import { ShootInput } from './input/shootInput';
import { FIXED_STEP, solveKick } from './physics/flight';
import { createPhysicsWorld } from './physics/world';
import { AimMarkers } from './scene/aimMarkers';
import { BallTrail, trailStyle } from './scene/ball';
import { Effects } from './scene/effects';
import { createGameCamera } from './scene/gameCamera';
import { setUpLighting } from './scene/lighting';
import { NetRipple } from './scene/netRipple';
import { loadStadium } from './scene/stadiumAsset';
import { COACH_TEXT, Coach } from './ui/coach';
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
const view = createGameCamera(world);
const camera = view.camera;

const ballMesh = stadium.ball;
const trail = new BallTrail();
const markers = new AimMarkers();
const effects = new Effects();
const net = new NetRipple(stadium.net, { groundY: world.groundY, lineZ: world.goal.lineZ });
scene.add(ballMesh, trail.mesh, markers.group, effects.group);

const physics = await createPhysicsWorld(world);
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
const input = new ShootInput(canvas);
const finePointer = window.matchMedia('(pointer: fine)').matches; // a mouse, not a finger
const power = createPowerMeter(window.matchMedia('(pointer: coarse)').matches);
const outcome = new OutcomeTracker(world.goal, world.ballRadius);
const events = new GameEvents();
const sound = new Sound();
const slowMotion = new SlowMotion();
const score = new Score();
const coach = new Coach();
connectFeedback(events, { world, camera: view, sound, effects, net, hud, slowMotion });

// Browsers only allow sound after a click or tap (on phones, once the finger lifts).
for (const type of ['pointerdown', 'pointerup']) window.addEventListener(type, () => sound.unlock(), true);
hud.showSound(!sound.muted);
hud.onToggleSound = () => {
  sound.setMuted(!sound.muted);
  hud.showSound(!sound.muted);
};

const BALL_START = world.ballStart;
type Phase = 'aiming' | 'charging' | 'flight' | 'result';
let phase: Phase = 'aiming';
let phaseTime = 0;
const aim = new THREE.Vector3(0, 1.2, world.goal.lineZ);
let lastQuality: StrikeQuality = 'good';

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
  setPhase('charging');
};

input.onRelease = () => {
  if (phase !== 'charging') return;
  const shot = shapeShot({ aim, power: power.value, curl: input.curl, minTargetY: world.ballRadius });
  const velocity = solveKick(BALL_START, shot.target, shot.speed, shot.spin);
  physics.kick(velocity, shot.spin);
  outcome.reset();
  trail.clear();
  trail.setStyle(trailStyle(power.value, shot.quality === 'perfect'));
  markers.hide();
  hud.showPower(null);
  input.enabled = false;
  lastQuality = shot.quality;
  coach.shotTaken();
  setPhase('flight');
  events.emit('kick', { power: power.value, quality: shot.quality });
};

function showResult() {
  const goal = outcome.result === 'goal';
  score.record(goal);
  hud.showScore(score.goals, score.shots);
  if (goal) {
    const perfect = lastQuality === 'perfect';
    const how = outcome.hitFrame ? 'in off the woodwork' : perfect ? 'perfect strike' : '';
    const streak = score.streak >= 2 ? `${score.streak} in a row!` : '';
    hud.showBanner('GOAL!', [how, streak].filter(Boolean).join(' · '), perfect);
  } else if (outcome.hitFrame) {
    hud.showBanner('WOODWORK!', 'so close');
  } else {
    hud.showBanner('MISS!', lastQuality === 'skied' ? 'too much power' : lastQuality === 'weak' ? 'not enough power' : '');
  }
  setPhase('result');
  events.emit('result', { result: outcome.result!, quality: lastQuality, woodwork: outcome.hitFrame, streak: score.streak });
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
  view.fit(w / h);
  effects.setViewportHeight(renderer.domElement.height);
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
let accumulator = 0;
let gameTime = 0;
const PREVIEW_POWER = (PERFECT_MIN + PERFECT_MAX) / 2; // the preview shows a well-struck shot

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const realDt = Math.min(timer.getDelta(), 0.1);
  const dt = slowMotion.update(realDt); // game time: slows down for a goal
  gameTime += dt;
  phaseTime += realDt;
  markers.update(realDt);

  if (phase === 'aiming') {
    if (input.hasPointer) {
      updateAim();
      markers.showReticle(aim, { charging: false, power: 0, perfect: false }, realDt);
    } else {
      markers.hide();
    }
  } else if (phase === 'charging') {
    power.update(realDt);
    const perfect = power.value >= PERFECT_MIN && power.value <= PERFECT_MAX;
    hud.showPower(power.value);
    markers.showReticle(aim, { charging: true, power: power.value, perfect }, realDt);
    const preview = shapeShot({ aim, power: PREVIEW_POWER, curl: input.curl, minTargetY: world.ballRadius }, () => 0.5);
    const kick = solveKick(BALL_START, preview.target, preview.speed, preview.spin);
    markers.showPreview(BALL_START, kick, preview.spin, perfect);
    if (power.sweeps >= 2) input.forceRelease(); // don't let a charge last forever
  }
  const tip = coach.update(phase, input.curl);
  hud.showHint(tip ? COACH_TEXT[tip] : null);

  accumulator += dt;
  while (accumulator >= FIXED_STEP) {
    physics.step();
    accumulator -= FIXED_STEP;
  }
  for (const contact of physics.takeContacts()) events.emit('contact', contact);

  const p = physics.ball.translation();
  const q = physics.ball.rotation();
  ballMesh.position.set(p.x, p.y, p.z);
  ballMesh.quaternion.set(q.x, q.y, q.z, q.w);

  if (phase === 'flight') {
    trail.push(p, gameTime);
    if (lastQuality === 'perfect') effects.glitterTrail(p, dt);
    const v = physics.ball.linvel();
    if (outcome.update(p, Math.hypot(v.x, v.y, v.z), dt)) showResult();
  } else if (phase === 'result') {
    trail.push(p, gameTime);
    if (phaseTime > 1.8) resetShot();
  }

  // Sway with the mouse while aiming (and hold it while charging), settle back otherwise.
  const sway = finePointer && input.hasPointer && (phase === 'aiming' || phase === 'charging');
  view.update(realDt, { charging: phase === 'charging', swayTarget: sway ? input.pointer.x : null });
  trail.update(gameTime, camera.position);
  effects.update(dt);
  net.update(dt);

  renderer.render(scene, camera);
});

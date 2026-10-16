import * as THREE from 'three';
import { KEEPER_SKILL, readShot } from './ai/keeper';
import { KeeperMotion } from './ai/keeperMotion';
import { connectFeedback } from './feedback';
import { clampAimToGoal } from './gameplay/aim';
import { GameEvents } from './gameplay/events';
import { OutcomeTracker } from './gameplay/outcome';
import { createPowerMeter, PERFECT_MAX, PERFECT_MIN, type StrikeQuality } from './gameplay/power';
import { shapeShot } from './gameplay/shot';
import { SlowMotion } from './gameplay/slowMotion';
import { ShootInput } from './input/shootInput';
import { FIXED_STEP, solveKick } from './physics/flight';
import { createPhysicsWorld } from './physics/world';
import { AimMarkers } from './scene/aimMarkers';
import { BallTrail, trailStyle } from './scene/ball';
import { Effects } from './scene/effects';
import { createGameCamera } from './scene/gameCamera';
import { KeeperModel } from './scene/keeper';
import { setUpLighting } from './scene/lighting';
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

// The keeper stands just off its line, toward the ball.
const keeper = new KeeperMotion({ x: 0, y: world.groundY, z: world.goal.lineZ + 0.35 }, KEEPER_SKILL);
const keeperModel = new KeeperModel();
scene.add(ballMesh, trail.mesh, markers.group, effects.group, keeperModel.group);

const physics = await createPhysicsWorld(world, { keeper: keeper.pose });
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
const input = new ShootInput(canvas);
const finePointer = window.matchMedia('(pointer: fine)').matches; // a mouse, not a finger
const power = createPowerMeter(window.matchMedia('(pointer: coarse)').matches);
const outcome = new OutcomeTracker(world.goal, world.ballRadius);
const events = new GameEvents();
const slowMotion = new SlowMotion();
const coach = new Coach();
connectFeedback(events, { world, camera: view, effects, hud, slowMotion });

const BALL_START = world.ballStart;
type Phase = 'aiming' | 'charging' | 'flight' | 'result';
let phase: Phase = 'aiming';
let phaseTime = 0;
const aim = new THREE.Vector3(0, 1.2, world.goal.lineZ);
let lastQuality: StrikeQuality = 'good';

// Pointer → point on the goal plane, kept inside the goal frame.
const raycaster = new THREE.Raycaster();
const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -world.goal.lineZ);
function updateAim() {
  raycaster.setFromCamera(new THREE.Vector2(input.pointer.x, input.pointer.y), camera);
  if (!raycaster.ray.intersectPlane(goalPlane, aim)) return;
  clampAimToGoal(aim, world.goal, world.groundY, world.ballRadius);
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
  keeper.react(readShot({ start: BALL_START, velocity, spin: shot.spin }, keeper.lineZ, world.goal, keeper.skill));
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
  if (outcome.result === 'goal') {
    const perfect = lastQuality === 'perfect';
    const ball = physics.ball.translation();
    const dived = keeper.wentFor;
    const wrongWay = dived !== null && Math.abs(dived.x) > 1 && Math.sign(dived.x) !== Math.sign(ball.x);
    const how = outcome.hitFrame
      ? 'in off the woodwork'
      : outcome.hitKeeper
        ? "past the keeper's fingertips"
        : wrongWay
          ? 'sent the keeper the wrong way'
          : perfect
            ? 'perfect strike'
            : '';
    hud.showBanner('GOAL!', how, perfect);
  } else if (outcome.result === 'saved') {
    const why = lastQuality === 'weak' ? 'not enough power' : keeper.guessed ? 'the keeper guessed right' : '';
    hud.showBanner('SAVED!', why || 'great save');
  } else if (outcome.hitFrame) {
    hud.showBanner('WOODWORK!', 'so close');
  } else {
    hud.showBanner('MISS!', lastQuality === 'skied' ? 'too much power' : lastQuality === 'weak' ? 'not enough power' : '');
  }
  setPhase('result');
  events.emit('result', { result: outcome.result!, quality: lastQuality, woodwork: outcome.hitFrame });
}

function resetShot() {
  physics.resetBall();
  keeper.recover();
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

  // The keeper edges toward where you aim while you line up the shot, and gets set while you charge.
  keeper.aimX = phase === 'charging' || (phase === 'aiming' && input.hasPointer) ? aim.x : null;
  keeper.set = phase === 'charging';

  accumulator += dt;
  while (accumulator >= FIXED_STEP) {
    keeper.step(FIXED_STEP);
    physics.poseKeeper(keeper.pose);
    physics.step();
    accumulator -= FIXED_STEP;
  }
  for (const contact of physics.takeContacts()) {
    if (contact.surface === 'keeper') outcome.keeperTouched(contact.point.z);
    events.emit('contact', contact);
  }

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
  view.update(realDt, { charging: phase === 'charging', swayTarget: sway ? input.pointer : null });
  trail.update(gameTime, camera.position);
  keeperModel.update(keeper.pose, dt);
  effects.update(dt);

  renderer.render(scene, camera);
});

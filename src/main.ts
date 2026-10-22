import * as THREE from 'three';
import { KEEPER_SKILL, readShot } from './ai/keeper';
import { KeeperMotion } from './ai/keeperMotion';
import { connectFeedback } from './feedback';
import { clampAimToGoal } from './gameplay/aim';
import { BoardsBoundary } from './gameplay/boundary';
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
import { BallAura } from './scene/ballAura';
import { BallFade } from './scene/ballFade';
import { Crowd } from './scene/crowd';
import { loadCrowdParts } from './scene/crowdAsset';
import { CrowdFlags, loadFlagLogo } from './scene/crowdFlags';
import { CROWD_SETTINGS } from './scene/crowdSettings';
import { Effects } from './scene/effects';
import { FloodlightGlow } from './scene/floodlightGlow';
import { cameraSettingsFromBlender, createGameCamera } from './scene/gameCamera';
import { IntroBackdrop } from './scene/introBackdrop';
import { IntroBall } from './scene/introBall';
import { IntroChips, loadChipModel } from './scene/introChips';
import { applyGrass } from './scene/grass';
import { KeeperModel } from './scene/keeper';
import { loadKeeperModel } from './scene/keeperAsset';
import { lightMovingObject, setUpLighting } from './scene/lighting';
import { Replay } from './scene/replay';
import { REPLAY_SETTINGS } from './scene/replaySettings';
import { AutoResolution, type AutoMemory } from './scene/autoResolution';
import { clampPixelRatio, pickPixelRatio, RESOLUTION_SETTINGS } from './scene/resolutionSettings';
import { Sky } from './scene/sky';
import { SKY_SETTINGS } from './scene/skySettings';
import { loadStadium } from './scene/stadiumAsset';
import { COACH_AIM_EITHER, COACH_KEY_TEXT, COACH_TEXT, Coach } from './ui/coach';
import { Hud } from './ui/hud';
import { PerfStats } from './ui/perfStats';
import { readBest, Round, saveBest } from './gameplay/round';
import { Screens } from './ui/screens';
import { Preloader } from './ui/preloader';
import { Wipe } from './ui/wipe';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// How many pixels the picture is drawn with; set by resize(), tweak it in src/scene/resolutionSettings.ts.
const touchScreen = window.matchMedia('(pointer: coarse)').matches;
let testPixelRatio: number | null = null; // set by the ?bench panel
// Measures this device while you aim and moves the sharpness a step up or down, remembered for next time.
const SHARPNESS_KEY = 'soccer.sharpness';
const autoSharpness = RESOLUTION_SETTINGS.auto
  ? new AutoResolution(
      RESOLUTION_SETTINGS.autoSettings,
      pickPixelRatio(window.devicePixelRatio, touchScreen),
      window.devicePixelRatio,
      readSharpness(),
      (memory) => {
        try {
          localStorage.setItem(SHARPNESS_KEY, JSON.stringify(memory));
        } catch {
          // private browsing: it just measures again next time
        }
      },
    )
  : null;
function readSharpness(): AutoMemory | null {
  try {
    return JSON.parse(localStorage.getItem(SHARPNESS_KEY) ?? 'null') as AutoMemory | null;
  } catch {
    return null;
  }
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// The stadium was lit with Blender's "Standard" view transform: plain sRGB, no tone mapping.
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
// The loading bar (in index.html) fills as the files below arrive.
const preloader = new Preloader();

// The keeper's and the crowd's Blender models load alongside the stadium.
const keeperAsset = loadKeeperModel();
const chipAsset = loadChipModel();
const crowdParts = loadCrowdParts(CROWD_SETTINGS.heads.map((h) => h.file));
const flagLogo = loadFlagLogo(renderer);
// The Blender stadium is the whole environment: pitch, goal, stands, ball and sun.
const stadium = await loadStadium((f) => preloader.file(f));
const world = stadium.config;
scene.add(stadium.environment);
// The pitch's grass: stripes, texture, shading and painted lines; tweak it in src/scene/grassSettings.ts.
const grass = await applyGrass(stadium.environment, renderer);
// The light baked in Blender, plus the live sun. After the grass, so the grass gets the baked light too.
const { envMap } = await setUpLighting(renderer, stadium.model);
// The stadium's own animations (the corner flags waving) loop for ever, slowed down with the game.
const stadiumMotion = new THREE.AnimationMixer(stadium.model);
for (const clip of stadium.animations) stadiumMotion.clipAction(clip).play();
// The sky and its drifting clouds; tweak them in src/scene/skySettings.ts.
const sky = new Sky(SKY_SETTINGS);
scene.add(sky.mesh);

// The gameplay camera: ball low in the foreground, goal centred; tweak it in src/scene/cameraSettings.ts.
const view = createGameCamera(world);
const camera = view.camera;
// The grass texture's blades stand up as seen from where the camera usually is.
grass.lookFrom(view.restPosition);
// A soft glow around the floodlight lamps; tweak it in src/scene/floodlightSettings.ts.
const floodlights = new FloodlightGlow(stadium.environment, view.restPosition);
scene.add(floodlights.group);
// The crowd, in rows behind the stand barriers; tweak it in src/scene/crowdSettings.ts.
// Placing everyone keeps the page busy for a couple of seconds, so the loading bar moves on by itself.
const parts = await crowdParts;
await preloader.step(0.78, 2.5);
const crowd = new Crowd(stadium.environment, parts, envMap);
scene.add(crowd.group);
// Big flags waving in the crowd; tweak them in src/scene/crowdFlagSettings.ts.
const crowdFlags = new CrowdFlags(crowd, envMap, await flagLogo);
scene.add(crowdFlags.mesh);

const ballMesh = stadium.ball;
// A ball that flies over the ad boards fades out: it's gone into the stands.
const ballFade = new BallFade(ballMesh);
const boards = new BoardsBoundary(world.boards ?? []);
const trail = new BallTrail();
const aura = new BallAura(world.ballRadius); // the gold glow round the ball on a perfect strike
const markers = new AimMarkers();
const effects = new Effects();

// The keeper stands just off its line, toward the ball.
const keeper = new KeeperMotion({ x: 0, y: world.groundY, z: world.goal.lineZ + 0.35 }, KEEPER_SKILL);
const keeperModel = new KeeperModel();
keeperModel.useModel(await keeperAsset);
lightMovingObject(ballMesh, envMap);
lightMovingObject(keeperModel.group, envMap);
scene.add(ballMesh, trail.mesh, aura.mesh, markers.group, effects.group, keeperModel.group);
// Soft shadows on the grass right under the ball and the keeper.
grass.followContacts(ballMesh, world.ballRadius, keeperModel.group);

const physics = await createPhysicsWorld(world, { keeper: keeper.pose });
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
// Draw calls, triangles and other numbers that show how hard the game works, above the FPS.
const perf = new PerfStats(document.querySelector<HTMLElement>('#hud')!, renderer);
const input = new ShootInput(canvas);
const finePointer = window.matchMedia('(pointer: fine)').matches; // a mouse, not a finger
const power = createPowerMeter(touchScreen);
const outcome = new OutcomeTracker(world.goal, world.ballRadius);
const events = new GameEvents();
const slowMotion = new SlowMotion();
const coach = new Coach();
// A round of the Croky Cup: 5 penalties, between the intro screen and the end screen.
const round = new Round();
const screens = new Screens(document.querySelector<HTMLElement>('#hud')!);
let playing = false; // a round is on (no intro or end screen in front)
input.enabled = false;
// The real ball spins on the intro, then flies down onto the spot on Speel nu (src/scene/introBall.ts).
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const introBall = new IntroBall(
  ballMesh,
  camera,
  renderer.domElement,
  world.ballRadius,
  { position: view.restPosition, quaternion: view.restQuaternion },
  reducedMotion,
);
const introBackdrop = new IntroBackdrop(ballMesh); // the purple tunnel behind it, opening up from the ball
// Croky chips swirling out from behind the ball on the intro (fewer on phones; none with reduced motion).
const introChips = new IntroChips(await chipAsset, touchScreen ? 24 : 40);
lightMovingObject(introChips.mesh, envMap);
introChips.mesh.castShadow = false;
scene.add(introChips.mesh);
let introSeen = false; // after the first time, the ball rises back up from the spot into the intro
screens.onIntro = () => {
  introBall.float(screens.ballSlot, introSeen);
  introSeen = true;
};
// After a goal, save or woodwork: a slow replay in comic panels, between two wipes; see src/scene/replaySettings.ts.
const replay = new Replay({
  world,
  renderer,
  scene,
  ball: ballMesh,
  ballFade,
  keeper: keeperModel,
  trail,
  aura,
  hide: [effects.group, markers.group],
});
const wipe = new Wipe(document.querySelector<HTMLElement>('#hud')!, REPLAY_SETTINGS);
// Add ?replayAngle=follow, behind or high to the address to see every replay from that one angle.
const replayAngle = new URLSearchParams(location.search).get('replayAngle');
if (replayAngle) replay.forceAngle(replayAngle);
connectFeedback(events, { world, camera: view, effects, hud, slowMotion });

const BALL_START = world.ballStart;
type Phase = 'aiming' | 'charging' | 'flight' | 'result' | 'wipe' | 'replay';
let phase: Phase = 'aiming';
let phaseTime = 0;
const aim = new THREE.Vector3(0, 1.2, world.goal.lineZ);
let lastQuality: StrikeQuality = 'good';

// Pointer → point on the goal plane, kept inside the goal frame. The arrow keys move that point instead.
const raycaster = new THREE.Raycaster();
const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -world.goal.lineZ);
function updateAim(keyStep = { x: 0, y: 0 }) {
  if (input.usingKeys) {
    aim.x += keyStep.x * 2 * world.goal.innerHalfWidth;
    aim.y += keyStep.y * (world.goal.crossbarY - world.groundY);
  } else {
    raycaster.setFromCamera(new THREE.Vector2(input.pointer.x, input.pointer.y), camera);
    if (!raycaster.ray.intersectPlane(goalPlane, aim)) return;
  }
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
  aura.begin(shot.quality === 'perfect');
  markers.hide();
  hud.showPower(null);
  input.enabled = false;
  lastQuality = shot.quality;
  replay.begin(gameTime);
  coach.shotTaken();
  setPhase('flight');
  events.emit('kick', { power: power.value, quality: shot.quality });
};

// Esc during a keyboard charge: back to aiming, no shot.
input.onCancel = () => {
  if (phase !== 'charging') return;
  hud.showPower(null);
  markers.hide(); // the curl preview goes; the aim comes straight back next frame
  setPhase('aiming');
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
  replay.recorder.markResult(gameTime);
  round.record(outcome.result!);
  hud.showScore(round.results, round.shots);
  setPhase('result');
  events.emit('result', { result: outcome.result!, quality: lastQuality, woodwork: outcome.hitFrame });
}

/** Ends the shot behind a wipe: a replay first if it was a big moment, then the next shot. */
function endShot() {
  const withReplay = replay.wanted(outcome.result ?? 'miss', outcome.hitFrame);
  setPhase('wipe');
  wipe.run(() => {
    if (withReplay) replay.start(outcome.result === 'goal');
    resetShot();
    if (replay.active) {
      setPhase('replay');
      wipe.showReplayTag(true);
    }
  }, nextShot);
}

/** Leaves the replay at its end, behind another wipe. */
function endReplay() {
  if (phase !== 'replay' || wipe.running) return;
  wipe.run(() => {
    replay.stop();
    wipe.showReplayTag(false);
    setPhase('wipe');
  }, nextShot);
}

/** Ball back on the spot and the keeper back in the middle, at once: the screen is covered. */
function resetShot() {
  physics.resetBall();
  ballFade.reset();
  keeper.reset();
  physics.poseKeeper(keeper.pose);
  trail.clear();
  aura.begin(false);
  hud.hideBanner();
  if (autoSharpness?.applyPending()) resize(); // a sharpness step, unseen behind the wipe
}

function nextShot() {
  if (phase !== 'wipe') return;
  setPhase('aiming');
  if (round.over) endRound();
  else input.enabled = true;
}

/** Speel nu (or Speel opnieuw): a fresh round from the first penalty, once the ball is on the spot. */
function startRound() {
  if (introBall.landing) return;
  round.reset();
  if (screens.introShown) {
    screens.leaveIntro();
    introBall.land(beginRound);
  } else {
    screens.hide();
    beginRound();
  }
}

function beginRound() {
  hud.showScore(round.results, round.shots);
  playing = true;
  input.enabled = phase === 'aiming';
}
screens.onPlay = startRound;

/** After the last penalty: the end screen with the score. */
function endRound() {
  playing = false;
  input.enabled = false;
  hud.showScore(null, round.shots);
  const before = readBest();
  saveBest(round.goals);
  screens.showEnd(round.results, round.shots, readBest(), before !== null && round.goals > before);
}

// The canvas fills the page (see style.css); only the number of pixels behind it changes.
let drawn = { w: 0, h: 0, ratio: 0 };
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const screenRatio = window.devicePixelRatio;
  const wanted = testPixelRatio ?? autoSharpness?.ratio ?? pickPixelRatio(screenRatio, touchScreen);
  const ratio = clampPixelRatio(wanted, screenRatio);
  // Resizing throws the old picture memory away, so only do it when something really changed.
  if (w === drawn.w && h === drawn.h && ratio === drawn.ratio) return;
  drawn = { w, h, ratio };
  renderer.setDrawingBufferSize(w, h, ratio);
  view.fit(w / h);
  effects.setViewportHeight(renderer.domElement.height);
  replay.resize(w, h);
}
window.addEventListener('resize', resize);
// Turning a phone: some browsers only know the new size a moment after the turn.
screen.orientation?.addEventListener('change', () => requestAnimationFrame(resize));
resize();
await preloader.step(0.86, 1);
replay.warmUp(camera); // sets up the replay's drawing now, so starting one later doesn't stutter

// Add ?edit to the game's address to open the settings editor (see the README).
if (new URLSearchParams(location.search).has('edit')) {
  const { openSettingsEditor } = await import('./ui/settingsEditor');
  openSettingsEditor({
    camera: view,
    blenderCamera: cameraSettingsFromBlender(world),
    grass,
    sky,
    floodlights,
    wipe: { play: () => wipe.run(() => {}) },
  });
}

// Add ?bench to the game's address for the sharpness test panel (see the README).
if (new URLSearchParams(location.search).has('bench')) {
  const { openBenchmark } = await import('./ui/benchmark');
  openBenchmark({
    renderer,
    perf,
    autoStatus: () =>
      autoSharpness ? `auto: ${autoSharpness.ratio}x, ${autoSharpness.status}` : 'auto: off',
    forgetAuto: () => localStorage.removeItem(SHARPNESS_KEY),
    setPixelRatio: (ratio) => {
      testPixelRatio = ratio;
      resize();
    },
  });
}

const timer = new THREE.Timer();
let accumulator = 0;
let gameTime = 0;
const PREVIEW_POWER = (PERFECT_MIN + PERFECT_MAX) / 2; // the preview shows a well-struck shot

// Prepares every shader now, so the first frames of the intro don't stutter.
await preloader.step(0.97, 1.2);
await renderer.compileAsync(scene, camera);
await preloader.done();
screens.showIntro();

renderer.setAnimationLoop((time) => {
  perf.begin(time);
  timer.update(time);
  const realDt = Math.min(timer.getDelta(), 0.1);
  const dt = slowMotion.update(realDt); // game time: slows down for a goal
  gameTime += dt;
  phaseTime += realDt;
  markers.update(realDt);
  // Not measured on the intro: while it's all purple the stadium isn't drawn, so those frames are light.
  if (testPixelRatio === null) autoSharpness?.frame(time, phase === 'aiming' && !introBall.active);

  const keyStep = input.keyStep(realDt); // held arrow keys: aim while aiming, curl while charging
  if (phase === 'aiming') {
    if (playing && input.hasPointer) {
      updateAim(keyStep);
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
  const tip = coach.update(phase === 'wipe' || phase === 'replay' ? 'result' : phase, input.curl);
  const tipText = input.usingKeys ? COACH_KEY_TEXT : COACH_TEXT;
  hud.showHint(
    !playing ? null : tip === 'aim' && finePointer && !input.usingKeys ? COACH_AIM_EITHER : tip ? tipText[tip] : null,
  );

  // The keeper edges toward where you aim while you line up the shot, and gets set while you charge.
  keeper.aimX = phase === 'charging' || (playing && phase === 'aiming' && input.hasPointer) ? aim.x : null;
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
    // The trail belongs to the shot: it stops at the first touch of anything but the grass.
    if (contact.surface !== 'ground') {
      trail.stop(gameTime);
      replay.recorder.markImpact(gameTime); // the replay ends just after this
    }
    events.emit('contact', contact);
  }

  const p = physics.ball.translation();
  const q = physics.ball.rotation();
  ballMesh.position.set(p.x, p.y, p.z);
  ballMesh.quaternion.set(q.x, q.y, q.z, q.w);

  if ((phase === 'flight' || phase === 'result') && boards.isBeyond(p)) {
    ballFade.start();
    outcome.wentOut();
    trail.stop(gameTime);
  }
  if (phase === 'flight') {
    trail.push(p, gameTime);
    effects.skim(p);
    if (lastQuality === 'perfect' && !ballFade.fading) effects.glitterTrail(p, dt);
    const v = physics.ball.linvel();
    if (outcome.update(p, Math.hypot(v.x, v.y, v.z), dt)) showResult();
  } else if (phase === 'result') {
    trail.push(p, gameTime);
    const replayNext = replay.wanted(outcome.result ?? 'miss', outcome.hitFrame);
    if (phaseTime > (replayNext ? REPLAY_SETTINGS.holdWithReplay : REPLAY_SETTINGS.holdWithout)) endShot();
  }
  if (phase === 'flight' || phase === 'result') replay.record(gameTime, p, q, keeper.pose);

  // Sway with the mouse while aiming (and hold it while charging), settle back otherwise.
  const sway =
    playing && finePointer && input.hasPointer && !input.usingKeys && (phase === 'aiming' || phase === 'charging');
  introBall.advance(realDt);
  view.update(realDt, {
    charging: phase === 'charging',
    swayTarget: sway ? input.pointer : null,
    intro: introBall.cameraIntro, // close to the goal on the intro, pulling back as the ball comes down
  });
  introBall.place(physics.ball.translation(), physics.ball.rotation());
  const chipsSwirl = introBall.floating || introBall.windingUp; // they keep swirling while the ball sinks in
  const chipsMode = reducedMotion ? 'off' : chipsSwirl ? 'swirl' : introBall.landing ? 'burst' : 'off';
  introChips.update(realDt, camera, ballMesh, chipsMode);
  trail.update(gameTime, camera.position, realDt);
  if (!replay.active) {
    const flying = (phase === 'flight' || phase === 'result') && trail.stopTime === null;
    aura.update(ballMesh, flying, ballFade.shown, dt);
  }
  keeperModel.update(keeper.pose, dt);
  effects.update(dt);
  ballFade.update(dt);
  stadiumMotion.update(dt);
  crowd.update(gameTime);
  crowdFlags.update(gameTime);
  sky.update(gameTime);

  if (replay.active) {
    replay.render(realDt);
    if (replay.finished) endReplay();
  } else {
    introBackdrop.render(renderer, scene, camera, introBall.reveal, reducedMotion, realDt);
  }
  perf.end(time);
});

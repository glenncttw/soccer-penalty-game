import * as THREE from 'three';
import { KEEPER_SKILL, readShot } from './ai/keeper';
import { KeeperMotion } from './ai/keeperMotion';
import { connectFeedback } from './feedback';
import { clampAimToGoal } from './gameplay/aim';
import { BallCatch } from './gameplay/ballCatch';
import { BoardsBoundary } from './gameplay/boundary';
import { GameEvents } from './gameplay/events';
import { OutcomeTracker } from './gameplay/outcome';
import { createPowerMeter, PERFECT_MAX, PERFECT_MIN, type StrikeQuality } from './gameplay/power';
import { shapeShot } from './gameplay/shot';
import { SlowMotion } from './gameplay/slowMotion';
import { ShootInput } from './input/shootInput';
import { FIXED_STEP, solveKick } from './physics/flight';
import { createPhysicsWorld, startPhysics, type Contact } from './physics/world';
import { AimMarkers } from './scene/aimMarkers';
import { BallTrail, trailStyle } from './scene/ball';
import { BallAura } from './scene/ballAura';
import { BallFade } from './scene/ballFade';
import { Crowd, placeCrowdInBackground } from './scene/crowd';
import { loadCrowdParts } from './scene/crowdAsset';
import { CrowdFlags, loadFlagLogo } from './scene/crowdFlags';
import { CROWD_SETTINGS } from './scene/crowdSettings';
import { Effects } from './scene/effects';
import { FloodlightGlow } from './scene/floodlightGlow';
import { cameraSettingsFromBlender, createGameCamera } from './scene/gameCamera';
import { IntroBackdrop } from './scene/introBackdrop';
import { IntroBall } from './scene/introBall';
import { IntroChips, loadChipModel } from './scene/introChips';
import { applyGrass, loadGrassTextures } from './scene/grass';
import { loadKeeperModel } from './scene/keeperAsset';
import { KeeperRig } from './scene/keeperRig';
import { copySun, lightMovingObject, loadBakes, loadPanorama, setUpLighting } from './scene/lighting';
import { Replay } from './scene/replay';
import { REPLAY_SETTINGS } from './scene/replaySettings';
import { AutoResolution, type AutoMemory } from './scene/autoResolution';
import { clampPixelRatio, pickPixelRatio, RESOLUTION_SETTINGS } from './scene/resolutionSettings';
import { Sky } from './scene/sky';
import { GradualWarmUp } from './scene/warmUp';
import { SKY_SETTINGS } from './scene/skySettings';
import { loadStadium } from './scene/stadiumAsset';
import { COACH_AIM_EITHER, COACH_KEY_TEXT, COACH_TEXT, Coach } from './ui/coach';
import { Hud } from './ui/hud';
import { PerfStats } from './ui/perfStats';
import { readBest, Round, saveBest } from './gameplay/round';
import { ENTER_TIME, Screens } from './ui/screens';
import { nextPaint, Preloader } from './ui/preloader';
import { gameFilesIn, rememberFiles } from './ui/rememberFiles';
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
// This device remembers the game's files, so the next visit doesn't download them again (public/sw.js).
rememberFiles();

// The landing comes first: it only needs the stadium (for its camera, ball and sun), the panorama's light on the
// ball, the chips and the font. The rest of the game loads behind it (below).
void document.fonts.load('700 1em Bazinga');
const chipAsset = loadChipModel();
const panorama = loadPanorama(renderer);
// The crowd's small models and the flag logo come along with them.
const crowdParts = loadCrowdParts(CROWD_SETTINGS.heads.map((h) => h.file));
const flagLogo = loadFlagLogo(renderer);
// The Blender stadium is the whole environment: pitch, goal, stands, ball and sun.
const stadium = await loadStadium((f) => preloader.file(f));
const envMap = await panorama;
const world = stadium.config;

// Where the keeper stands, just in front of its goal line.
const KEEPER_HOME = { x: 0, y: world.groundY, z: world.goal.lineZ + 0.35 };
// The gameplay camera: ball low in the foreground, goal centred; tweak it in src/scene/cameraSettings.ts.
// At the end of a round it moves in close to the keeper.
const view = createGameCamera(world, undefined, KEEPER_HOME);
const camera = view.camera;
const ballMesh = stadium.ball;
lightMovingObject(ballMesh, envMap);
scene.add(ballMesh);
// Until the stadium is in the scene, its sun lights the landing's ball and chips from a copy.
const landingSun = copySun(stadium.model);
scene.add(landingSun, landingSun.target);

const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
// Draw calls, triangles and other numbers that show how hard the game works, above the FPS.
const perf = new PerfStats(document.querySelector<HTMLElement>('#hud')!, renderer);
const screens = new Screens(document.querySelector<HTMLElement>('#hud')!);
const ballOnScreen = new THREE.Vector3();
const introBallCircle = { x: 0, y: 0, radius: 0 }; // where the intro's ball is on screen, in CSS pixels
/** Tells the intro where the ball is on screen, so its title makes room for the ball in front of it. */
function followIntroBall() {
  ballOnScreen.copy(ballMesh.position).project(camera);
  const { clientWidth: w, clientHeight: h } = renderer.domElement;
  const away = camera.position.distanceTo(ballMesh.position);
  const r = world.ballRadius;
  const radius = (r / Math.sqrt(Math.max(away * away - r * r, 1e-6))) * camera.projectionMatrix.elements[5] * (h / 2);
  Object.assign(introBallCircle, { x: ((ballOnScreen.x + 1) / 2) * w, y: ((1 - ballOnScreen.y) / 2) * h, radius });
  const { x, y } = introBall.squash; // wider and flatter while it bounces
  screens.followBall(introBallCircle.x, introBallCircle.y, radius * x, radius * y);
}
/** True when (x, y), in CSS pixels, is on the intro's ball. */
function onIntroBall(x: number, y: number) {
  const c = introBallCircle;
  return screens.introShown && Math.hypot(x - c.x, y - c.y) < c.radius;
}
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
// On the intro the ball follows the mouse a little, and bounces when you click it (only the button plays).
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  introBall.pointAt((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  document.documentElement.classList.toggle('over-ball', introBall.bouncy && onIntroBall(e.clientX, e.clientY));
});
window.addEventListener('pointerdown', (e) => {
  const c = introBallCircle;
  if (onIntroBall(e.clientX, e.clientY)) introBall.bounce((e.clientX - c.x) / c.radius, (e.clientY - c.y) / c.radius);
});
document.documentElement.addEventListener('pointerleave', () => introBall.pointAt(0, 0));
const introBackdrop = new IntroBackdrop(ballMesh); // the purple tunnel behind it, opening up from the ball
// Croky chips swirling out from behind the ball on the intro (fewer on phones; none with reduced motion).
const introChips = new IntroChips(await chipAsset, touchScreen ? 24 : 40);
lightMovingObject(introChips.mesh, envMap);
introChips.mesh.castShadow = false;
scene.add(introChips.mesh);
let introSeen = false; // after the first time, the ball rises back up from the spot into the intro
screens.onIntro = () => {
  introBall.float(screens.ballSlot, introSeen, !introSeen); // the first time it flies in out of the tunnel
  if (!introSeen) introChips.enter();
  introSeen = true;
};
// Speel nu before the game is in: it starts as soon as it is (see below).
let playSoon = false;
screens.onPlay = () => {
  playSoon = true;
  screens.waitToPlay();
};

// The canvas fills the page (see style.css); only the number of pixels behind it changes.
let drawn = { w: 0, h: 0, ratio: 0 };
let resizeGame: (() => void) | null = null; // the game's own parts, once it's in
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
  resizeGame?.();
}
window.addEventListener('resize', resize);
// Turning a phone: some browsers only know the new size a moment after the turn.
screen.orientation?.addEventListener('change', () => requestAnimationFrame(resize));
resize();

// The landing on its own, while the game loads: the ball, the chips and the tunnel.
const timer = new THREE.Timer();
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }; // the ball's turn on the spot before physics has it
const landingFrame = (time: number) => {
  timer.update(time);
  const realDt = Math.min(timer.getDelta(), 0.1);
  introBall.advance(realDt);
  view.update(realDt, { charging: false, swayTarget: null, intro: introBall.cameraIntro, ending: false });
  introBall.place(world.ballStart, IDENTITY);
  if (screens.open) followIntroBall();
  if (!introBall.bouncy) document.documentElement.classList.remove('over-ball');
  const chipsMode = reducedMotion ? 'off' : introBall.floating ? 'swirl' : 'off';
  introChips.update(realDt, camera, { position: introBall.home }, chipsMode);
  warmUp?.step(); // drawn over below
  introBackdrop.render(renderer, scene, camera, introBall.reveal, reducedMotion, realDt, introBall.home);
};
let warmUp: GradualWarmUp | null = null; // the game's materials, getting ready one per frame (see the end)
// Prepares the landing's shaders, so its first frames don't stutter.
await renderer.compileAsync(scene, camera);
await preloader.done();
renderer.setAnimationLoop(landingFrame);
screens.showIntro(true); // with its entrance: the ball flies in, then the logo, the title and the button

// ---- The rest of the game, loading behind the landing (Speel nu pressed before then starts it once it's in).
// Between the heavier steps the page draws a frame, so the landing keeps moving.
const keeperAsset = loadKeeperModel();
const grassTextures = loadGrassTextures(renderer);
const bakes = loadBakes(renderer);
const physicsReady = startPhysics();
// The files download meanwhile, but the page itself only gets busy after the landing's entrance.
await new Promise((resolve) => setTimeout(resolve, ENTER_TIME));
// The crowd is placed in the background (the page stays free meanwhile); see src/scene/crowdSettings.ts.
const crowdPlan = Crowd.prepare(stadium.environment, await crowdParts);
const crowdPlacement = placeCrowdInBackground(crowdPlan.input);
await nextPaint();
// The stadium's own animations (the corner flags waving) loop for ever, slowed down with the game.
const stadiumMotion = new THREE.AnimationMixer(stadium.model);
for (const clip of stadium.animations) stadiumMotion.clipAction(clip).play();
// The sky and its drifting clouds; tweak them in src/scene/skySettings.ts.
const sky = new Sky(SKY_SETTINGS);
// A soft glow around the floodlight lamps; tweak it in src/scene/floodlightSettings.ts.
const floodlights = new FloodlightGlow(stadium.environment, view.restPosition);
// The pitch's grass: stripes, texture, shading and painted lines; tweak it in src/scene/grassSettings.ts.
await grassTextures;
const grass = await applyGrass(stadium.environment, renderer);
// The grass texture's blades stand up as seen from where the camera usually is.
grass.lookFrom(view.restPosition);
await nextPaint();
// The light baked in Blender, plus the live sun. After the grass, so the grass gets the baked light too.
const { sun } = await setUpLighting(renderer, stadium.model, { bakes, envMap: panorama });
// The stadium's sun (now set up with its shadows) takes over from the landing's copy, in the same place.
if (sun) {
  stadium.environment.updateMatrixWorld(true);
  scene.attach(sun);
  scene.attach(sun.target);
}
scene.remove(landingSun, landingSun.target);
introBackdrop.lightsChanged();
introBackdrop.drawSceneOnce();
await nextPaint();
// The crowd, in rows behind the stand barriers.
const crowd = new Crowd(crowdPlan, await crowdPlacement);
crowd.light(envMap);
await nextPaint();
// Big flags waving in the crowd; tweak them in src/scene/crowdFlagSettings.ts.
const crowdFlags = new CrowdFlags(crowd, envMap, await flagLogo);
await nextPaint();

// A ball that flies over the ad boards fades out: it's gone into the stands.
const ballFade = new BallFade(ballMesh);
const boards = new BoardsBoundary(world.boards ?? []);
const trail = new BallTrail();
const aura = new BallAura(world.ballRadius); // the gold glow round the ball on a perfect strike
const markers = new AimMarkers();
const effects = new Effects();
const replayEffects = new Effects(); // the replay makes the dust and glitter again, slowed down like the ball
replayEffects.group.visible = false;

// The keeper (Glenn's bird with its Blender animations) stands just off its line, toward the ball.
const { model: keeperModel, animations: keeperAnimations } = await keeperAsset;
const keeperRig = new KeeperRig(keeperModel, keeperAnimations);
const keeper = new KeeperMotion(KEEPER_HOME, KEEPER_SKILL, keeperRig);
lightMovingObject(keeperRig.object, envMap);
// Soft shadows on the grass right under the ball and the keeper.
grass.followContacts(ballMesh, world.ballRadius, keeperRig.shadow);
await nextPaint();

// The keeper's solid parts follow its bones, so the ball is stopped where you see it.
await physicsReady;
const physics = await createPhysicsWorld(world, { keeper: { shapes: keeperRig.shapes, parts: keeperRig.parts } });
const ballCatch = new BallCatch(); // the keeper holding on to the ball in its catch save
const input = new ShootInput(canvas);
const finePointer = window.matchMedia('(pointer: fine)').matches; // a mouse, not a finger
const power = createPowerMeter(touchScreen);
const outcome = new OutcomeTracker(world.goal, world.ballRadius);
const events = new GameEvents();
const slowMotion = new SlowMotion();
const coach = new Coach();
// A round of the Croky Cup: 5 penalties, between the intro screen and the end screen.
const round = new Round();
let playing = false; // a round is on (no intro or end screen in front)
input.enabled = false;
// After a goal, save or woodwork: a slow replay in comic panels, between two wipes; see src/scene/replaySettings.ts.
const replay = new Replay({
  world,
  renderer,
  scene,
  ball: ballMesh,
  ballFade,
  keeper: keeperRig,
  trail,
  aura,
  hide: [effects.group, markers.group],
  effects: replayEffects,
  crowd: {
    get clock() {
      return crowd.clock;
    },
    show(time, clock) {
      crowd.show(time, clock);
      crowdFlags.update(time); // the flags move with their bearers
    },
  },
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
/** aim.x when the keeper was last centred, until you move the aim away from it (then null: it follows). */
let aimAtReset: number | null = null;
const KEEPER_FOLLOW_AFTER = 0.1; // metres the aim must move before the keeper follows it again
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
  replay.begin(gameTime, { power: power.value, perfect: shot.quality === 'perfect' });
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
  if (outcome.result === 'goal' || outcome.result === 'saved') crowd.react(outcome.result, { still: reducedMotion });
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
    centreKeeper(); // the replay posed the keeper: put it back while the wipe covers the screen
    aura.begin(false);
    wipe.showReplayTag(false);
    setPhase('wipe');
  }, nextShot);
}

/** Ball back on the spot and the keeper back in the middle, at once: the screen is covered. */
function resetShot() {
  physics.resetBall();
  ballCatch.reset();
  ballFade.reset();
  centreKeeper();
  trail.clear();
  if (!replay.active) aura.begin(false); // a replay of a perfect strike still shows its glow
  hud.hideBanner();
  if (autoSharpness?.applyPending()) resize(); // a sharpness step, unseen behind the wipe
}

/**
 * The keeper back in the middle, standing at ease, at once. It stays there until you move the aim
 * (or start a shot): the aim left over from the last shot shouldn't pull it straight back across.
 */
function centreKeeper() {
  keeper.reset();
  physics.poseKeeper(keeperRig.parts, true);
  aimAtReset = aim.x;
}

function nextShot() {
  if (phase !== 'wipe') return;
  setPhase('aiming');
  crowd.calm();
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
  centreKeeper();
  crowd.calm();
  hud.showScore(round.results, round.shots);
  playing = true;
  input.enabled = phase === 'aiming';
}

/** After the last penalty: the end screen with the score. */
function endRound() {
  playing = false;
  input.enabled = false;
  hud.showScore(null, round.shots);
  const before = readBest();
  saveBest(round.goals);
  screens.showEnd(round.results, round.shots, readBest(), before !== null && round.goals > before);
  keeper.celebrate();
}

resizeGame = () => {
  effects.setViewportHeight(renderer.domElement.height);
  replay.resize(drawn.w, drawn.h);
};
resizeGame();
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
    crowd,
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

let accumulator = 0;
let gameTime = 0;
const PREVIEW_POWER = (PERFECT_MIN + PERFECT_MAX) / 2; // the preview shows a well-struck shot

// Everything joins the landing's ball and chips. The landing doesn't show it until Speel nu, but every
// material gets ready now, one per frame, so neither the landing nor the game's first frames stutter.
scene.add(stadium.environment, sky.mesh, floodlights.group, crowd.group, crowdFlags.mesh);
scene.add(trail.mesh, aura.mesh, markers.group, effects.group, replayEffects.group, keeperRig.object);
warmUp = new GradualWarmUp(renderer, scene, camera);
await warmUp.done;
warmUp = null;
introBackdrop.drawSceneOnce(); // with all of it now, for the sun's shadows
await nextPaint();
// Sets up the replay's own drawing too (its panel), so starting one later doesn't stutter.
replay.warmUp(camera);
await nextPaint();
// The physics engine's first step takes it a moment (it gets its own code ready), so it's taken now too.
physics.step();
await nextPaint();

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

  // The keeper gets ready and steps across toward where you aim while you line up the shot.
  const aiming = playing && phase === 'aiming' && (input.hasPointer || input.usingKeys);
  if (aimAtReset !== null && (phase === 'charging' || Math.abs(aim.x - aimAtReset) > KEEPER_FOLLOW_AFTER)) {
    aimAtReset = null;
  }
  keeper.ready = phase === 'charging' || aiming;
  keeper.aimX = aimAtReset === null && keeper.ready ? aim.x : null;

  accumulator += dt;
  let caught: Contact | null = null;
  while (accumulator >= FIXED_STEP) {
    keeper.step(FIXED_STEP);
    physics.poseKeeper(keeperRig.parts);
    const taken = ballCatch.step(keeper.catchSpot, physics, FIXED_STEP);
    caught ??= taken;
    physics.step();
    accumulator -= FIXED_STEP;
  }
  // A goal slows the game down for the ball, but the keeper, beaten by then, carries on at full
  // speed: its dive in slow motion looked like it was floating.
  if (outcome.result === 'goal' && realDt > dt) {
    keeper.step(realDt - dt);
    physics.poseKeeper(keeperRig.parts);
  }
  if (caught) outcome.caught(caught.point.z);
  for (const contact of caught ? [caught, ...physics.takeContacts()] : physics.takeContacts()) {
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
  if (phase === 'flight' || phase === 'result') replay.record(gameTime, p, q);

  // Sway with the mouse while aiming (and hold it while charging), settle back otherwise.
  const sway =
    playing && finePointer && input.hasPointer && !input.usingKeys && (phase === 'aiming' || phase === 'charging');
  introBall.advance(realDt);
  view.update(realDt, {
    charging: phase === 'charging',
    swayTarget: sway ? input.pointer : null,
    intro: introBall.cameraIntro, // close to the goal on the intro, pulling back as the ball comes down
    ending: screens.endShown, // close to the keeper dancing, beside the score
  });
  introBall.place(physics.ball.translation(), physics.ball.rotation());
  if (screens.open && !screens.endShown) followIntroBall();
  if (!introBall.bouncy) document.documentElement.classList.remove('over-ball');
  const chipsSwirl = introBall.floating || introBall.windingUp; // they keep swirling while the ball sinks in
  const chipsMode = reducedMotion ? 'off' : chipsSwirl ? 'swirl' : introBall.landing ? 'burst' : 'off';
  introChips.update(realDt, camera, { position: introBall.home }, chipsMode);
  trail.update(gameTime, camera.position, realDt);
  if (!replay.active) {
    const flying = (phase === 'flight' || phase === 'result') && trail.stopTime === null;
    aura.update(ballMesh, flying, ballFade.shown, dt);
  }
  effects.update(dt);
  ballFade.update(dt);
  stadiumMotion.update(dt);
  if (phase === 'aiming') crowd.waitAround(realDt, reducedMotion); // now and then a Mexican wave
  crowd.update(gameTime, realDt);
  crowdFlags.update(gameTime);
  sky.update(gameTime);

  if (replay.active) {
    replay.render(realDt);
    if (replay.finished) endReplay();
  } else {
    introBackdrop.render(renderer, scene, camera, introBall.reveal, reducedMotion, realDt, introBall.home);
  }
  perf.end(time);
});

// The game is in: Speel nu plays now, or straight away if it was pressed already.
screens.gameIn();
void gameFilesIn();
screens.onPlay = startRound;
if (playSoon) startRound();

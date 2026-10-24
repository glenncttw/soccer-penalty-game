import * as THREE from 'three';
import { blankFrame, ReplayRecorder, replayWindow, type ReplayFrame } from '../gameplay/replayRecorder';
import type { Vec3 } from '../physics/ballForces';
import type { Quat } from '../physics/keeperBody';
import { palette } from '../theme';
import type { WorldConfig } from '../worldConfig';
import { BallTrail } from './ball';
import type { BallAura } from './ballAura';
import type { BallFade } from './ballFade';
import type { Effects } from './effects';
import type { PurpleTunnel } from './introBackdrop';
import type { KeeperRig } from './keeperRig';
import { REPLAY_ANGLES, replayCameraPose, type ReplayAngle } from './replayCamera';
import { REPLAY_SETTINGS, type ReplaySettings } from './replaySettings';

const SHADOW = palette.crokyPurpleDeep; // the panel's drop shadow: a deep purple
const POP_TIME = 0.45; // seconds the panel takes to pop in, over the purple
const HOLD = 0.3; // seconds the panel shows the replay's first moment while it pops in, before it plays
const OUT_TIME = 0.3; // seconds the panel takes to pop away at the end
const TILT = THREE.MathUtils.degToRad(-4); // the panel leans 4 degrees (to the right), like a sticker
const SWING = THREE.MathUtils.degToRad(-1.5); // and swings in that much further as it pops in, then settles
const TAG_SPACE = 64; // CSS pixels kept free at the top for the "REPLAY" label

export interface ReplayParts {
  world: WorldConfig;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  ball: THREE.Object3D;
  ballFade: BallFade;
  keeper: KeeperRig;
  /** The live trail: the replay copies its colours and when it stopped. */
  trail: BallTrail;
  /** The glow round the ball on a perfect strike: shown in the replay too, until the ball's first touch. */
  aura: BallAura;
  /** Things that are left out of the replay: the aim markers, and the game's own dust and glitter. */
  hide: THREE.Object3D[];
  /**
   * The replay's own kick dust, grass puffs and perfect-strike glitter: made again as the replay reaches
   * them and moved on game time, so they slow down with the ball.
   */
  effects: Effects;
  /** The crowd: its clock is recorded with every frame, and the replay shows them as they were (`time` is game time). */
  crowd: { readonly clock: number; show(time: number, clock: number): void };
  /** The landing's purple tunnel: the replay's background, behind its panel. */
  tunnel: PurpleTunnel;
  /** The game's camera: the tunnel is seen through its lens, so it looks as it does on the landing. */
  camera: THREE.PerspectiveCamera;
  /** Reduced motion: the tunnel's rings stand still. */
  still: boolean;
}

/**
 * Records every shot and, after a big moment, plays it back slowly in one comic-style panel in
 * the middle of the screen: the ball flying to the goal, up to just after it hits the keeper, the
 * frame or the net. Each replay takes the next camera angle (see replayCamera.ts); they all look
 * toward the goal, the part of the stadium that is built.
 */
export class Replay {
  readonly recorder = new ReplayRecorder();
  active = false;
  private readonly frame = blankFrame();
  private readonly pose: Float32Array;
  private readonly trail = new BallTrail();
  private readonly overlay = new THREE.Scene();
  private readonly screen = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private readonly panel = new THREE.Group();
  private readonly picture: THREE.Mesh;
  private readonly border: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  /** The panel's size and centre on screen, in CSS pixels. */
  private rect = { x: 0, y: 0, w: 1, h: 1 };
  private window = { start: 0, end: 0, rate: 1, length: 0 };
  /** Replay seconds in at which the result was decided, and the crowd's clock then. */
  private result = { elapsed: 0, clock: 0 };
  private elapsed = 0;
  /** Seconds since the replay started: its panel popping in, playing, then popping away. */
  private age = 0;
  /** Replay seconds it plays for: the part of the shot in `window`, and a goal's celebration after it. */
  private length = 0;
  private trailStop: number | null = null;
  /** The kick being replayed: how hard, and whether it was perfect (glitter). */
  private kick = { power: 0, perfect: false };
  /** Game time the replay's dust has been moved on to, the last recorded frame it saw and the next one. */
  private effectsTime = 0;
  private frameTime = 0;
  private nextEffect = 0;
  private nextPush = 0;
  private side = 1;
  private angle = -1; // index into REPLAY_ANGLES; the first replay takes the first angle
  private forced: number | null = null;
  private readonly end = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly ballNow = new THREE.Vector3();
  private size = { w: 1, h: 1 };

  constructor(
    private readonly parts: ReplayParts,
    private readonly settings: ReplaySettings = REPLAY_SETTINGS,
  ) {
    this.pose = new Float32Array(parts.keeper.snapshotSize);
    this.trail.mesh.visible = false;
    parts.scene.add(this.trail.mesh);

    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.PlaneGeometry(1, 1);
    const flat = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
    this.shadow = new THREE.Mesh(plane, flat(SHADOW));
    this.border = new THREE.Mesh(plane, flat(palette.white));
    this.picture = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.target.texture, toneMapped: false }));
    this.shadow.position.z = 0.1;
    this.border.position.z = 0.2;
    this.picture.position.z = 0.3;
    this.panel.add(this.shadow, this.border, this.picture);
    this.overlay.add(this.panel);
  }

  /**
   * Draws everything the replay uses once, out of sight (into the panel's own picture), so the
   * browser sets up its shaders and pictures now and not at the start of the first replay.
   */
  warmUp(camera: THREE.PerspectiveCamera) {
    const { renderer, scene } = this.parts;
    this.camera.position.copy(camera.position);
    this.camera.quaternion.copy(camera.quaternion);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, this.camera);
    this.parts.tunnel.drawStraight(renderer, camera, 0); // into the panel's own picture: never seen
    renderer.render(this.overlay, this.screen);
    renderer.setRenderTarget(null);
  }

  /** Always use this angle (for checking one angle: add ?replayAngle=follow, behind or high to the address). */
  forceAngle(name: string) {
    const i = REPLAY_ANGLES.indexOf(name as ReplayAngle);
    this.forced = i >= 0 ? i : null;
  }

  /** Call at the kick. */
  begin(gameTime: number, kick = { power: 0, perfect: false }) {
    this.recorder.start(gameTime);
    this.kick = kick;
  }

  /** Call every frame while the ball is in play. */
  record(gameTime: number, ball: Vec3, spin: Quat) {
    const { ballFade, keeper, crowd } = this.parts;
    this.recorder.record(gameTime, ball, spin, ballFade.shown, keeper.snapshot(this.pose), crowd.clock);
  }

  /** True if the shot that just ended deserves a replay. */
  wanted(result: 'goal' | 'saved' | 'miss', woodwork: boolean) {
    const m = this.settings.moments;
    return (result === 'goal' && m.goal) || (result === 'saved' && m.save) || (woodwork && m.woodwork);
  }

  /**
   * Starts playing back the last shot. Call while the screen is covered. For a goal it plays on to
   * the ball hitting the net (not stopping at a post it went in off); otherwise to the first thing
   * the ball hit: the keeper's hands, the post or the bar.
   */
  start(goal: boolean) {
    const r = this.recorder;
    if (!r.frames.length) return;
    this.trailStop = this.parts.trail.stopTime;
    const resultAt = r.resultAt ?? r.endAt;
    const impactAt = r.impactAfter(goal ? resultAt : r.kickAt);
    this.window = replayWindow(r.kickAt, resultAt, r.endAt, this.settings, impactAt);
    this.length = this.window.length + (goal ? this.settings.goalCheer : 0);
    this.result = {
      elapsed: (resultAt - this.window.start) / this.window.rate,
      clock: r.sample(resultAt, this.frame).crowd,
    };
    r.sample(this.window.end, this.frame);
    this.end.set(this.frame.ball.x, this.frame.ball.y, this.frame.ball.z);
    this.side = this.end.x >= 0 ? 1 : -1;
    this.angle = this.forced ?? (this.angle + 1) % REPLAY_ANGLES.length;
    this.trail.setStyle(this.parts.trail.currentStyle);
    this.trail.clear();
    this.parts.aura.begin(this.parts.aura.perfect);
    this.trail.mesh.visible = true;
    this.nextPush = 0;
    const { effects, world } = this.parts;
    effects.clear();
    effects.kickPuff(world.ballStart, world.groundY, this.kick.power);
    effects.group.visible = true;
    this.effectsTime = this.frameTime = r.kickAt;
    this.nextEffect = 0;
    this.elapsed = this.age = 0;
    this.active = true;
    for (const o of this.parts.hide) o.visible = false;
    this.parts.trail.mesh.visible = false;
    this.sample(0);
    this.look.copy(this.ballNow);
  }

  /** Stops the replay and gives the screen back to the game. */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.trail.clear();
    this.trail.mesh.visible = false;
    this.parts.effects.clear();
    this.parts.effects.group.visible = false;
    for (const o of this.parts.hide) o.visible = true;
    this.parts.trail.mesh.visible = true;
    this.parts.ballFade.reset();
  }

  /** True once the whole replay has played and its panel has popped away. */
  get finished() {
    return this.age >= HOLD + this.length + OUT_TIME;
  }

  /** True while the panel pops away at the end. */
  get leaving() {
    return this.age >= HOLD + this.length;
  }

  /** Lays the panel out for a screen of `w` x `h` CSS pixels. */
  resize(w: number, h: number) {
    this.size = { w, h };
    this.screen.right = w;
    this.screen.top = h;
    this.screen.updateProjectionMatrix();
    const gap = Math.min(w, h) * 0.06;
    const room = { w: w - 2 * gap, h: h - TAG_SPACE - 2 * gap }; // the space under the "REPLAY" label
    // A wide picture on wide screens; nearly square on phones held upright, so it isn't a thin strip.
    const aspect = w >= h ? 16 / 10 : 1;
    const pw = Math.min(room.w * (w >= h ? 0.82 : 1), room.h * aspect) * this.settings.panelSize;
    const ph = pw / aspect;
    this.rect = { x: w / 2, y: h / 2, w: pw, h: ph }; // in the middle of the screen; y counts up from the bottom
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const scale = this.parts.renderer.getPixelRatio() * this.settings.resolution;
    this.target.setSize(Math.max(1, Math.round(pw * scale)), Math.max(1, Math.round(ph * scale)));
    this.parts.effects.setViewportHeight(this.target.height);
  }

  /** Moves the replay on by `realDt` seconds and draws it. */
  render(realDt: number) {
    const { renderer, scene } = this.parts;
    this.age += realDt;
    this.elapsed = Math.min(this.length, Math.max(0, this.age - HOLD));
    const t = this.sample(this.elapsed);

    // Recorded positions go into the replay's own trail as the replay reaches them.
    const frames = this.recorder.frames;
    const life = this.trail.currentStyle.life;
    while (this.nextPush < frames.length && frames[this.nextPush].t <= t) {
      const f = frames[this.nextPush++];
      if (f.t >= this.window.start - life) this.trail.push(f.ball, f.t);
    }
    if (this.trailStop !== null && t >= this.trailStop) this.trail.stop(this.trailStop);
    this.moveEffects(t);

    this.aim(realDt);
    this.trail.update(t, this.camera.position, realDt);
    const flying = this.trailStop === null || t < this.trailStop;
    this.parts.aura.update(this.parts.ball, flying, this.parts.ballFade.shown, realDt);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(null);

    const border = Math.max(5, Math.min(this.size.w, this.size.h) * 0.016);
    // Pops in, then (at the end) the same backwards: a little bigger first, then away.
    const out = (this.age - HOLD - this.length) / OUT_TIME;
    const k = out > 0 ? popIn(1 - out) : popIn(this.age / POP_TIME);
    const { x, y, w, h } = this.rect;
    this.panel.position.set(x, y, 0);
    this.panel.rotation.z = TILT + SWING * (1 - k); // swings in a little extra, then settles
    this.panel.scale.setScalar(Math.max(0.001, k));
    this.picture.scale.set(w, h, 1);
    this.border.scale.set(w + 2 * border, h + 2 * border, 1);
    this.shadow.scale.copy(this.border.scale);
    this.shadow.position.set(border * 1.2, -border * 1.2, 0.1);
    this.drawTunnel(realDt);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.overlay, this.screen);
    renderer.autoClear = autoClear;
  }

  /** The background: the landing's purple tunnel, whole (no hole), its rings drifting toward you. */
  private drawTunnel(realDt: number) {
    const { renderer, tunnel, still, camera } = this.parts;
    tunnel.uniforms.uHole.value.set(0, 0, -100);
    tunnel.uniforms.uOpacity.value = 1;
    tunnel.drawStraight(renderer, camera, still ? 0 : realDt, this.settings.tunnelSpeed);
  }

  /** Puts the ball, keeper and crowd where they were `elapsed` replay seconds in. Returns the game time shown. */
  private sample(elapsed: number) {
    const w = this.window;
    // After the part of the shot it shows, a goal's celebration: the ball settling in the net, slower still.
    const over = Math.max(0, elapsed - w.length);
    const t = w.start + (elapsed - over) * w.rate + over * this.settings.slowest;
    const f: ReplayFrame = this.recorder.sample(t, this.frame);
    const { ball, ballFade, keeper } = this.parts;
    ball.position.set(f.ball.x, f.ball.y, f.ball.z);
    ball.quaternion.set(f.spin.x, f.spin.y, f.spin.z, f.spin.w);
    ballFade.showAt(f.ballOpacity);
    keeper.apply(f.keeper);
    this.ballNow.set(f.ball.x, f.ball.y, f.ball.z);
    // The crowd as they were, up to the result. From then on their reaction plays at its real speed, not slowed
    // down like the ball, so their jumping and shouting fit in before the replay ends.
    const r = this.result;
    this.parts.crowd.show(t, elapsed > r.elapsed ? r.clock + (elapsed - r.elapsed) : f.crowd);
    return t;
  }

  /**
   * Moves the replay's dust and glitter on to game time `t`, a recorded frame at a time, the way the game made
   * them while the ball flew (up to the result): grass puffs under a low ball, sparkles behind a perfect strike.
   */
  private moveEffects(t: number) {
    const { effects } = this.parts;
    const frames = this.recorder.frames;
    const flightEnd = this.recorder.resultAt ?? Infinity;
    while (this.nextEffect < frames.length && frames[this.nextEffect].t <= t) {
      const f = frames[this.nextEffect++];
      effects.update(f.t - this.effectsTime);
      this.effectsTime = f.t;
      if (f.t < flightEnd) {
        effects.skim(f.ball);
        // As many sparkles as in the game: one frame's worth, however the replay's drawing falls between frames.
        if (this.kick.perfect && f.ballOpacity >= 1) effects.glitterTrail(f.ball, f.t - this.frameTime);
      }
      this.frameTime = f.t;
    }
    effects.update(Math.max(0, t - this.effectsTime));
    this.effectsTime = Math.max(this.effectsTime, t);
  }

  /** Puts the camera where this replay's angle wants it, following the ball a little smoothed. */
  private aim(realDt: number) {
    const { world } = this.parts;
    this.look.lerp(this.ballNow, 1 - Math.exp(-5 * realDt));
    const pose = replayCameraPose(
      REPLAY_ANGLES[this.angle],
      this.look,
      { lineZ: world.goal.lineZ, groundY: world.groundY, end: this.end, side: this.side },
      Math.min(1, this.elapsed / Math.max(this.window.length, 1e-6)),
    );
    const cam = this.camera;
    cam.position.set(pose.position.x, pose.position.y, pose.position.z);
    cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
    cam.fov = pose.fov;
    cam.updateProjectionMatrix();
  }
}

/** 0 → 1 with a springy overshoot. */
function popIn(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const c = 1.9;
  const t = x - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
}

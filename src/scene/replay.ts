import * as THREE from 'three';
import { blankFrame, ReplayRecorder, replayWindow, type ReplayFrame } from '../gameplay/replayRecorder';
import type { Vec3 } from '../physics/ballForces';
import type { KeeperPose, Quat } from '../physics/keeperBody';
import { palette } from '../theme';
import type { WorldConfig } from '../worldConfig';
import { BallTrail } from './ball';
import type { BallFade } from './ballFade';
import type { KeeperModel } from './keeper';
import { REPLAY_ANGLES, replayCameraPose, type ReplayAngle } from './replayCamera';
import { REPLAY_SETTINGS, type ReplaySettings } from './replaySettings';

const SHADOW = 0x3b1f4f; // the panel's drop shadow: a deep purple
const POP_TIME = 0.4; // seconds the panel takes to pop in
const TILT = THREE.MathUtils.degToRad(-1.5); // the panel leans a little, like a sticker
const TAG_SPACE = 64; // CSS pixels kept free at the top for the "REPLAY" label

export interface ReplayParts {
  world: WorldConfig;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  ball: THREE.Object3D;
  ballFade: BallFade;
  keeper: KeeperModel;
  /** The live trail: the replay copies its colours and when it stopped. */
  trail: BallTrail;
  /** Things that are left out of the replay (dust, glitter). */
  hide: THREE.Object3D[];
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
  private readonly trail = new BallTrail();
  private readonly overlay = new THREE.Scene();
  private readonly screen = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private readonly panel = new THREE.Group();
  private readonly picture: THREE.Mesh;
  private readonly border: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  /** The panel's size and centre on screen, in CSS pixels. */
  private rect = { x: 0, y: 0, w: 1, h: 1 };
  private window = { start: 0, end: 0, rate: 1, length: 0 };
  private elapsed = 0;
  private trailStop: number | null = null;
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
    this.trail.mesh.visible = false;
    parts.scene.add(this.trail.mesh);

    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMaterial());
    this.overlay.add(this.backdrop);
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
    renderer.render(this.overlay, this.screen); // into the panel's own picture: never seen
    renderer.setRenderTarget(null);
  }

  /** Always use this angle (for checking one angle: add ?replayAngle=follow, behind or high to the address). */
  forceAngle(name: string) {
    const i = REPLAY_ANGLES.indexOf(name as ReplayAngle);
    this.forced = i >= 0 ? i : null;
  }

  /** Call at the kick. */
  begin(gameTime: number) {
    this.recorder.start(gameTime);
  }

  /** Call every frame while the ball is in play. */
  record(gameTime: number, ball: Vec3, spin: Quat, keeper: KeeperPose) {
    this.recorder.record(gameTime, ball, spin, this.parts.ballFade.shown, keeper);
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
    r.sample(this.window.end, this.frame);
    this.end.set(this.frame.ball.x, this.frame.ball.y, this.frame.ball.z);
    this.side = this.end.x >= 0 ? 1 : -1;
    this.angle = this.forced ?? (this.angle + 1) % REPLAY_ANGLES.length;
    this.trail.setStyle(this.parts.trail.currentStyle);
    this.trail.clear();
    this.trail.mesh.visible = true;
    this.nextPush = 0;
    this.elapsed = 0;
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
    for (const o of this.parts.hide) o.visible = true;
    this.parts.trail.mesh.visible = true;
    this.parts.ballFade.reset();
  }

  /** True once the whole replay has played. */
  get finished() {
    return this.elapsed >= this.window.length;
  }

  /** Lays the panel out for a screen of `w` x `h` CSS pixels. */
  resize(w: number, h: number) {
    this.size = { w, h };
    this.screen.right = w;
    this.screen.top = h;
    this.screen.updateProjectionMatrix();
    this.backdrop.scale.set(w, h, 1);
    this.backdrop.position.set(w / 2, h / 2, 0);
    this.backdrop.material.uniforms.size.value.set(w, h);
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
  }

  /** Moves the replay on by `realDt` seconds and draws it. */
  render(realDt: number) {
    const { renderer, scene } = this.parts;
    this.elapsed = Math.min(this.window.length, this.elapsed + realDt);
    const t = this.sample(this.elapsed);
    this.backdrop.material.uniforms.time.value += realDt;

    // Recorded positions go into the replay's own trail as the replay reaches them.
    const frames = this.recorder.frames;
    const life = this.trail.currentStyle.life;
    while (this.nextPush < frames.length && frames[this.nextPush].t <= t) {
      const f = frames[this.nextPush++];
      if (f.t >= this.window.start - life) this.trail.push(f.ball, f.t);
    }
    if (this.trailStop !== null && t >= this.trailStop) this.trail.stop(this.trailStop);

    this.aim(realDt);
    this.trail.update(t, this.camera.position);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(null);

    const border = Math.max(5, Math.min(this.size.w, this.size.h) * 0.016);
    const k = popIn(this.elapsed / POP_TIME);
    const { x, y, w, h } = this.rect;
    this.panel.position.set(x, y, 0);
    this.panel.rotation.z = TILT * (2 - k); // swings in a little extra, then settles
    this.panel.scale.setScalar(Math.max(0.001, k));
    this.picture.scale.set(w, h, 1);
    this.border.scale.set(w + 2 * border, h + 2 * border, 1);
    this.shadow.scale.copy(this.border.scale);
    this.shadow.position.set(border * 1.2, -border * 1.2, 0.1);
    renderer.render(this.overlay, this.screen);
  }

  /** Puts the ball and keeper where they were `elapsed` replay seconds in. Returns the game time shown. */
  private sample(elapsed: number) {
    const w = this.window;
    const t = w.start + elapsed * w.rate;
    const f: ReplayFrame = this.recorder.sample(t, this.frame);
    const { ball, ballFade, keeper } = this.parts;
    ball.position.set(f.ball.x, f.ball.y, f.ball.z);
    ball.quaternion.set(f.spin.x, f.spin.y, f.spin.z, f.spin.w);
    ballFade.showAt(f.ballOpacity);
    keeper.update(f.keeper, 0);
    this.ballNow.set(f.ball.x, f.ball.y, f.ball.z);
    return t;
  }

  /** Puts the camera where this replay's angle wants it, following the ball a little smoothed. */
  private aim(realDt: number) {
    const { world } = this.parts;
    this.look.lerp(this.ballNow, 1 - Math.exp(-5 * realDt));
    const pose = replayCameraPose(
      REPLAY_ANGLES[this.angle],
      this.look,
      { lineZ: world.goal.lineZ, groundY: world.groundY, end: this.end, side: this.side },
      this.elapsed / Math.max(this.window.length, 1e-6),
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

/** A purple background with wide slanted stripes sliding slowly across. */
function backdropMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      size: { value: new THREE.Vector2(1, 1) },
      dark: { value: new THREE.Color(palette.purple) },
      light: { value: new THREE.Color(0x7d4a9c) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec2 size;
      uniform vec3 dark;
      uniform vec3 light;
      varying vec2 vUv;
      void main() {
        vec2 px = vUv * size;
        float band = fract((px.x + px.y * 0.5) / (min(size.x, size.y) * 0.18) - time * 0.25);
        float d = abs(band - 0.5); // 0 in the middle of a light stripe, 0.5 in the middle of a dark one
        float edge = fwidth(d);
        gl_FragColor = vec4(mix(light, dark, smoothstep(0.25 - edge, 0.25 + edge, d)), 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
}

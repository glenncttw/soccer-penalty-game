import * as THREE from 'three';
import { blankFrame, ReplayRecorder, replayWindow, type ReplayFrame } from '../gameplay/replayRecorder';
import type { Vec3 } from '../physics/ballForces';
import type { KeeperPose, Quat } from '../physics/keeperBody';
import { palette } from '../theme';
import type { WorldConfig } from '../worldConfig';
import { BallTrail } from './ball';
import type { BallFade } from './ballFade';
import type { KeeperModel } from './keeper';
import { REPLAY_SETTINGS, type ReplaySettings } from './replaySettings';

const SHADOW = 0x3b1f4f; // the panels' drop shadow: a deep purple
const POP_TIME = 0.4; // seconds a panel takes to pop in
const POP_DELAY = 0.12; // the second panel pops in this much later
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

interface Panel {
  camera: THREE.PerspectiveCamera;
  target: THREE.WebGLRenderTarget;
  group: THREE.Group;
  picture: THREE.Mesh;
  border: THREE.Mesh;
  shadow: THREE.Mesh;
  tilt: number;
  /** Size and centre on screen, in CSS pixels. */
  rect: { x: number; y: number; w: number; h: number };
}

/**
 * Records every shot and, after a big moment, plays it back slowly in two comic-style
 * panels, each from its own camera: one following the ball from behind, one low by the goal.
 * Both look toward the goal, the part of the stadium that is built.
 */
export class Replay {
  readonly recorder = new ReplayRecorder();
  active = false;
  private readonly frame = blankFrame();
  private readonly trail = new BallTrail();
  private readonly overlay = new THREE.Scene();
  private readonly screen = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly panels: Panel[];
  private window = { start: 0, end: 0, rate: 1, length: 0 };
  private elapsed = 0;
  private trailStop: number | null = null;
  private nextPush = 0;
  private side = 1;
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
    this.panels = [-2.2, 1.8].map((deg) => {
      const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.PlaneGeometry(1, 1);
      const flat = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
      const shadow = new THREE.Mesh(plane, flat(SHADOW));
      const border = new THREE.Mesh(plane, flat(palette.white));
      const picture = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false }));
      shadow.position.z = 0.1;
      border.position.z = 0.2;
      picture.position.z = 0.3;
      const group = new THREE.Group();
      group.add(shadow, border, picture);
      this.overlay.add(group);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
      return { camera, target, group, picture, border, shadow, tilt: THREE.MathUtils.degToRad(deg), rect: { x: 0, y: 0, w: 1, h: 1 } };
    });
  }

  /**
   * Draws everything the replay uses once, out of sight (into the panels' own pictures), so the
   * browser sets up its shaders and pictures now and not at the start of the first replay.
   */
  warmUp(camera: THREE.PerspectiveCamera) {
    const { renderer, scene } = this.parts;
    for (const p of this.panels) {
      p.camera.position.copy(camera.position);
      p.camera.quaternion.copy(camera.quaternion);
      renderer.setRenderTarget(p.target);
      renderer.render(scene, p.camera);
    }
    renderer.render(this.overlay, this.screen); // into the last panel's picture: never seen
    renderer.setRenderTarget(null);
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

  /** Starts playing back the last shot. Call while the screen is covered. */
  start() {
    const r = this.recorder;
    if (!r.frames.length) return;
    this.window = replayWindow(r.kickAt, r.resultAt ?? r.endAt, r.endAt, this.settings);
    r.sample(r.resultAt ?? r.endAt, this.frame);
    this.end.set(this.frame.ball.x, this.frame.ball.y, this.frame.ball.z);
    this.side = this.end.x >= 0 ? 1 : -1;
    this.trailStop = this.parts.trail.stopTime;
    this.trail.setStyle(this.parts.trail.currentStyle);
    this.trail.clear();
    this.trail.mesh.visible = true;
    this.nextPush = 0;
    this.elapsed = 0;
    this.active = true;
    for (const o of this.parts.hide) o.visible = false;
    this.parts.trail.mesh.visible = false;
    // Every panel draws the same moment, so the sun's shadows are drawn once per frame, not per panel.
    this.parts.renderer.shadowMap.autoUpdate = false;
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
    this.parts.renderer.shadowMap.autoUpdate = true;
    this.parts.ballFade.reset();
  }

  /** True once the whole replay has played. */
  get finished() {
    return this.elapsed >= this.window.length;
  }

  /** Lays the panels out for a screen of `w` x `h` CSS pixels. */
  resize(w: number, h: number) {
    this.size = { w, h };
    this.screen.right = w;
    this.screen.top = h;
    this.screen.updateProjectionMatrix();
    this.backdrop.scale.set(w, h, 1);
    this.backdrop.position.set(w / 2, h / 2, 0);
    this.backdrop.material.uniforms.size.value.set(w, h);
    const across = w >= h; // side by side on wide screens, one above the other on tall ones
    const gap = Math.min(w, h) * 0.06;
    const top = TAG_SPACE; // room for the "REPLAY" label
    const pw = across ? (w - 3 * gap) / 2 : w - 3 * gap;
    const ph = across ? Math.min((h - top) * 0.7, pw * 0.72) : Math.min((h - top - 3 * gap) / 2, pw * 0.85);
    const cy = (h - top) / 2; // the middle of the space under the label (y counts up from the bottom)
    const scale = this.parts.renderer.getPixelRatio() * this.settings.resolution;
    this.panels.forEach((p, i) => {
      const s = i === 0 ? -1 : 1;
      p.rect = across
        ? { x: w / 2 + (s * (pw + gap)) / 2, y: cy - s * h * 0.03, w: pw, h: ph }
        : { x: w / 2 + s * w * 0.015, y: cy - (s * (ph + gap)) / 2, w: pw, h: ph };
      p.camera.aspect = pw / ph;
      p.camera.updateProjectionMatrix();
      p.target.setSize(Math.max(1, Math.round(pw * scale)), Math.max(1, Math.round(ph * scale)));
    });
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
    renderer.shadowMap.needsUpdate = true;
    for (const p of this.panels) {
      this.trail.update(t, p.camera.position);
      renderer.setRenderTarget(p.target);
      renderer.render(scene, p.camera);
    }
    renderer.setRenderTarget(null);

    const border = Math.max(4, Math.min(this.size.w, this.size.h) * 0.014);
    this.panels.forEach((p, i) => {
      const k = popIn((this.elapsed - i * POP_DELAY) / POP_TIME);
      const { x, y, w, h } = p.rect;
      p.group.position.set(x, y, 0);
      p.group.rotation.z = p.tilt * (2 - k); // swings in a little extra, then settles
      p.group.scale.setScalar(Math.max(0.001, k));
      p.picture.scale.set(w, h, 1);
      p.border.scale.set(w + 2 * border, h + 2 * border, 1);
      p.shadow.scale.copy(p.border.scale);
      p.shadow.position.set(border * 1.2, -border * 1.2, 0.1);
    });
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

  /** Places the two replay cameras for this moment. */
  private aim(realDt: number) {
    const { world } = this.parts;
    const g = world.goal;
    const ground = world.groundY;
    const start = world.ballStart;
    const u = this.window.length > 0 ? this.elapsed / this.window.length : 1;

    // 1: just behind the spot and a little to the side, a long lens following the ball to the goal.
    const follow = this.panels[0].camera;
    follow.position.set(-this.side * 0.7, ground + 0.6, start.z + 1.6);
    this.look.lerp(this.ballNow, 1 - Math.exp(-6 * realDt));
    follow.lookAt(this.look.x * 0.8, Math.max(ground + 0.5, this.look.y), Math.min(this.look.z, start.z - 2));
    follow.fov = 24;
    follow.updateProjectionMatrix();

    // 2: low by the goal on the other side from the ball, creeping in, looking across at the keeper and the net.
    const goal = this.panels[1].camera;
    goal.position.set(-this.side * 1.1, ground + 0.32, g.lineZ + 5.2 - 0.8 * u);
    goal.lookAt(this.end.x * 0.8, ground + 0.85, g.lineZ - 0.3);
    goal.fov = 50;
    goal.updateProjectionMatrix();
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

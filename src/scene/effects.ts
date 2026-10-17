import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../physics/ballForces';
import { palette } from '../theme';
import { random } from './random';

/** Where the ball leaves a small puff on the grass after the kick (metres from the spot), while it's still low. */
const SKIM_STEPS = [0.4, 0.7, 1.0];
/** The ball counts as low while its bottom is at most this far (m) above the grass. */
const SKIM_HEIGHT = 0.15;
const DUST_WHITE = 0xfffaf0;
/** Cut grass: a little lighter than the pitch, so the blades stand out against it. */
const BLADE_DARK = new THREE.Color(0x7cb342);
const BLADE_LIGHT = new THREE.Color(0xa8d860);

/** Kick dust and perfect-strike glitter. */
export class Effects {
  readonly group = new THREE.Group();
  private readonly dust = new PuffPool(96, blobGeometry());
  private readonly blades = new PuffPool(32, bladeGeometry(), { doubleSided: true, tipLift: 0.3 });
  private readonly glitter = new ParticlePool(220, THREE.AdditiveBlending);
  private glitterDue = 0;
  private readonly bladeColor = new THREE.Color();
  /** The kick being followed for its first metre (see `skim`), or null. */
  private skid: {
    x: number;
    z: number;
    groundY: number;
    radius: number;
    lastX: number;
    lastY: number;
    lastZ: number;
    lastD: number;
    step: number;
  } | null = null;

  constructor() {
    this.group.add(this.dust.mesh, this.blades.mesh, this.glitter.points);
  }

  /** Drawing-buffer height in pixels; particle sizes are in metres and need it. */
  setViewportHeight(px: number) {
    this.glitter.setViewportHeight(px);
  }

  /**
   * Chunky cartoon dust kicked up from the penalty spot: a few puffs burst out low over the grass to
   * the left and right, with specks of dust and cut blades of grass flying up. `at` is the ball's centre.
   */
  kickPuff(at: Vec3, groundY: number, power: number) {
    const p = 0.6 + power;
    const clusters = 3 + Math.round(power * 2);
    for (let c = 0; c < clusters; c++) {
      // Out to the left and right, never straight back: there they would hide the ball from the camera.
      const side = c % 2 ? 1 : -1;
      const angle = rand(-0.3, 0.35) * Math.PI; // below 0 toward the goal, above 0 back toward the camera
      const dx = side * Math.cos(angle);
      const dz = Math.sin(angle);
      const speed = rand(0.5, 1.1) * p;
      const size = rand(0.045, 0.085) * (0.85 + 0.3 * power);
      this.cluster({
        x: at.x + dx * 0.22,
        y: groundY + size * 0.6,
        z: at.z + dz * 0.22,
        vx: dx * speed,
        vy: rand(0.15, 0.45) * p,
        vz: dz * speed,
        size,
        blobs: 3 + Math.floor(Math.random() * 3),
        life: [0.45, 0.8],
      });
    }
    const specks = 3 + Math.round(power * 3);
    for (let i = 0; i < specks; i++) {
      const angle = rand(-0.2, 1.2) * Math.PI;
      const speed = rand(0.8, 2.2) * p;
      this.dust.spawn({
        x: at.x + rand(-0.1, 0.1),
        y: groundY + 0.03,
        z: at.z + rand(-0.1, 0.1),
        vx: Math.cos(angle) * speed,
        vy: rand(1.2, 2.4) * p,
        vz: Math.sin(angle) * speed,
        size: rand(0.012, 0.025),
        life: rand(0.45, 0.75),
        color: DUST_WHITE,
        gravity: 8,
        drag: 1,
        floor: groundY,
      });
    }
    // Cut blades of grass: flung up and back (away from where the ball goes), tumbling and
    // fluttering down like light leaves, then shrinking away as they reach the grass.
    const blades = 6 + Math.round(power * 5);
    for (let i = 0; i < blades; i++) {
      const angle = rand(0.15, 0.85) * Math.PI;
      const speed = rand(0.4, 1.3) * p;
      this.blades.spawn({
        x: at.x + rand(-0.12, 0.12),
        y: groundY + 0.03,
        z: at.z + rand(-0.08, 0.12),
        vx: Math.cos(angle) * speed,
        vy: rand(1.6, 2.8) * p,
        vz: Math.sin(angle) * speed,
        size: rand(0.07, 0.1),
        life: rand(1.5, 1.9),
        color: this.bladeColor.lerpColors(BLADE_DARK, BLADE_LIGHT, Math.random()).getHex(),
        gravity: 6,
        drag: 2.2,
        floor: groundY + 0.004,
        spin: rand(6, 12),
        flutter: rand(0.3, 0.6),
        pop: false,
        shrinkFrom: 0.85,
        grow: 0,
      });
    }
    const radius = at.y - groundY;
    this.skid = { x: at.x, z: at.z, groundY, radius, lastX: at.x, lastY: at.y, lastZ: at.z, lastD: 0, step: 0 };
  }

  /** Leaves a small puff on the grass under the ball at a few points of its first metre; call every frame while it flies. */
  skim(at: Vec3) {
    const s = this.skid;
    if (!s) return;
    const d = Math.hypot(at.x - s.x, at.z - s.z);
    while (s.step < SKIM_STEPS.length && d >= SKIM_STEPS[s.step]) {
      // Where the ball was when it passed this step, between last frame and this one.
      const t = (SKIM_STEPS[s.step] - s.lastD) / Math.max(d - s.lastD, 1e-6);
      const x = s.lastX + (at.x - s.lastX) * t;
      const y = s.lastY + (at.y - s.lastY) * t;
      const z = s.lastZ + (at.z - s.lastZ) * t;
      if (y - s.radius - s.groundY <= SKIM_HEIGHT) {
        const size = rand(0.04, 0.07);
        this.cluster({
          x,
          y: s.groundY + size * 0.6,
          z,
          vx: rand(-0.4, 0.4),
          vy: rand(0.2, 0.4),
          vz: rand(-0.2, 0.2),
          size,
          blobs: 2 + Math.floor(Math.random() * 2),
          life: [0.35, 0.55],
        });
      }
      s.step++;
    }
    s.lastX = at.x;
    s.lastY = at.y;
    s.lastZ = at.z;
    s.lastD = d;
    if (s.step >= SKIM_STEPS.length) this.skid = null;
  }

  /** One puff: a few overlapping blobs that drift together and shrink away one by one. */
  private cluster(c: Omit<PuffSpec, 'life' | 'color' | 'gravity' | 'drag'> & { blobs: number; life: [number, number] }) {
    for (let i = 0; i < c.blobs; i++) {
      this.dust.spawn({
        x: c.x + rand(-1, 1) * c.size,
        y: c.y + rand(-0.4, 0.6) * c.size,
        z: c.z + rand(-1, 1) * c.size,
        vx: c.vx * rand(0.85, 1.15),
        vy: c.vy * rand(0.85, 1.15),
        vz: c.vz * rand(0.85, 1.15),
        size: c.size * rand(0.6, 1.1),
        life: rand(c.life[0], c.life[1]),
        color: DUST_WHITE,
        gravity: 0.5,
        drag: 3.5,
      });
    }
  }

  /** Sparkles left behind the ball on a perfect strike; call every frame while it flies. */
  glitterTrail(at: Vec3, dt: number) {
    this.glitterDue += dt * 110; // sparkles per second
    for (; this.glitterDue >= 1; this.glitterDue--) {
      this.glitter.spawn({
        x: at.x + rand(-0.1, 0.1),
        y: at.y + rand(-0.1, 0.1),
        z: at.z + rand(-0.1, 0.1),
        vx: rand(-0.7, 0.7),
        vy: rand(-0.2, 0.9),
        vz: rand(-0.4, 0.4),
        size: rand(0.05, 0.1),
        grow: 0,
        life: rand(0.25, 0.5),
        alpha: 1,
        color: Math.random() < 0.6 ? palette.gold : 0xfff7d6,
        gravity: 1.2,
        drag: 1.5,
      });
    }
  }

  update(dt: number) {
    this.dust.update(dt);
    this.blades.update(dt);
    this.glitter.update(dt);
  }
}

interface PuffSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Radius in metres once it has popped up. */
  size: number;
  life: number;
  color: number;
  /** Downward pull (m/s²) and air drag (per second). */
  gravity: number;
  drag: number;
  /** Height of the grass: it shrinks away as soon as it gets down there. */
  floor?: number;
  /** How fast it tumbles (radians per second; default 2) and sways side to side (m/s; default 0). */
  spin?: number;
  flutter?: number;
  /** Pops up with an overshoot (default) or appears at full size. */
  pop?: boolean;
  /** When (0..1 of its life) it starts to shrink (default 0.3), and how much it grows by the end (default 0.25). */
  shrinkFrom?: number;
  grow?: number;
}

/** How long (s) a puff takes to pop up to full size. */
const POP_TIME = 0.1;
/** How long (s) a falling bit takes to shrink away once it reaches the grass. */
const VANISH_TIME = 0.15;

/**
 * A fixed pool of solid shapes in one draw call: lumpy dust blobs or blades of grass. A dust blob pops
 * up quickly, a little too big, then drifts and shrinks to nothing; they never fade, like cartoon smoke.
 */
class PuffPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly puffs: (PuffSpec & { age: number; axis: THREE.Vector3; turn: number; landedAt?: number })[] = [];
  private next = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();

  /**
   * `doubleSided` for flat shapes. `tipLift` brightens the shape toward its top (+y) end: a blade's tip
   * is lighter than its cut end.
   */
  constructor(
    private readonly capacity: number,
    geometry: THREE.BufferGeometry,
    { doubleSided = false, tipLift = 0 } = {},
  ) {
    const material = new THREE.ShaderMaterial({
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      uniforms: {
        // Lit from above and a little from the sun's side (the right), with a soft, pale shade underneath.
        lightDir: { value: new THREE.Vector3(0.5, 1, 0.15).normalize() },
        shade: { value: new THREE.Color(0xc4cec8) },
        tipLift: { value: tipLift },
      },
      vertexShader: /* glsl */ `
        uniform float tipLift;
        varying vec3 vNormal;
        varying vec3 vColor;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vColor = instanceColor * (1.0 + tipLift * position.y);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 lightDir;
        uniform vec3 shade;
        varying vec3 vNormal;
        varying vec3 vColor;
        void main() {
          vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
          float lit = smoothstep(-0.4, 0.7, dot(n, lightDir));
          gl_FragColor = vec4(vColor * mix(shade, vec3(1.0), lit), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.color.setHex(DUST_WHITE));
    }
  }

  spawn(spec: PuffSpec) {
    const slot = this.next;
    this.next = (this.next + 1) % this.capacity;
    const axis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    this.puffs[slot] = { ...spec, age: 0, axis, turn: rand(0, Math.PI * 2) };
    this.mesh.setColorAt(slot, this.color.setHex(spec.color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.puffs.length; i++) {
      const s = this.puffs[i];
      if (!s || s.age >= s.life) {
        this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
        continue;
      }
      s.age += dt;
      const k = Math.min(1, s.age / s.life);
      if (s.landedAt === undefined && s.floor !== undefined && s.y <= s.floor) s.landedAt = s.age;
      if (s.landedAt === undefined) {
        const drag = Math.exp(-s.drag * dt);
        s.vx *= drag;
        s.vy = s.vy * drag - s.gravity * dt;
        s.vz *= drag;
        s.x += (s.vx + Math.sin(s.age * 9 + s.turn) * (s.flutter ?? 0)) * dt;
        s.y = Math.max(s.y + s.vy * dt, s.floor ?? -Infinity);
        s.z += s.vz * dt;
        s.turn += dt * (s.spin ?? 2);
      }
      // Pop up with a little overshoot (ease-out-back), then shrink away faster and faster.
      const pop = Math.min(1, s.age / POP_TIME) - 1;
      const popped = s.pop === false ? 1 : 1 + 2.7 * pop * pop * pop + 1.7 * pop * pop;
      const from = s.shrinkFrom ?? 0.3;
      const shrink = Math.max(0, (k - from) / (1 - from));
      const gone = s.landedAt === undefined ? 0 : Math.min(1, (s.age - s.landedAt) / VANISH_TIME);
      if (gone >= 1) s.age = s.life;
      const r = s.size * popped * (1 - shrink * shrink) * (1 + (s.grow ?? 0.25) * k) * (1 - gone * gone);
      this.position.set(s.x, s.y, s.z);
      this.rotation.setFromAxisAngle(s.axis, s.turn);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.scale.setScalar(r)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A lumpy ball of radius about 1: one blob of a dust puff. */
function blobGeometry() {
  const ico = new THREE.IcosahedronGeometry(1, 2);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const geo = mergeVertices(ico);
  const rng = random(11);
  const bumps = Array.from({ length: 5 }, () => new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize());
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 0.94;
    for (const b of bumps) r += 0.14 * Math.max(0, v.dot(b)) ** 3;
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Size in metres at birth; `grow` is how much it has grown (as a multiple) by the end of its life. */
  size: number;
  grow: number;
  life: number;
  alpha: number;
  color: number;
  /** Downward pull (m/s²) and air drag (per second). */
  gravity: number;
  drag: number;
}

/** A fixed pool of soft, round particles drawn as points. */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly tints: Float32Array;
  private readonly sizes: Float32Array;
  private readonly specs: (ParticleSpec & { age: number })[] = [];
  private next = 0;
  private readonly uniforms = { viewportHeight: { value: 720 } };
  private readonly color = new THREE.Color();

  constructor(private readonly capacity: number, blending: THREE.Blending) {
    this.positions = new Float32Array(capacity * 3);
    this.tints = new Float32Array(capacity * 4);
    this.sizes = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tints, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec4 tint;
        uniform float viewportHeight;
        varying vec4 vTint;
        void main() {
          vTint = tint;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * projectionMatrix[1][1] * viewportHeight * 0.5 / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vTint;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = vTint.a * (1.0 - smoothstep(0.35, 1.0, d));
          if (a < 0.01) discard;
          gl_FragColor = vec4(vTint.rgb, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
  }

  setViewportHeight(px: number) {
    this.uniforms.viewportHeight.value = px;
  }

  spawn(spec: ParticleSpec) {
    const slot = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.specs[slot] = { ...spec, age: 0 };
    this.color.setHex(spec.color);
    this.tints.set([this.color.r, this.color.g, this.color.b, 0], slot * 4);
  }

  update(dt: number) {
    for (let i = 0; i < this.specs.length; i++) {
      const s = this.specs[i];
      if (!s || s.age >= s.life) {
        this.sizes[i] = 0;
        continue;
      }
      s.age += dt;
      const k = Math.min(1, s.age / s.life);
      const drag = Math.exp(-s.drag * dt);
      s.vx *= drag;
      s.vy = s.vy * drag - s.gravity * dt;
      s.vz *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      this.positions.set([s.x, s.y, s.z], i * 3);
      this.sizes[i] = s.size * (1 + (s.grow - 1) * k);
      this.tints[i * 4 + 3] = s.alpha * (1 - k * k);
    }
    const geo = this.points.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('tint').needsUpdate = true;
    geo.getAttribute('size').needsUpdate = true;
  }
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * A blade of grass 1 long (y from -0.5 at the cut end to 0.5 at the tip), tapering to a point and
 * curling a little to one side.
 */
function bladeGeometry() {
  const rows = 4;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const half = 0.09 * (1 - t) ** 0.7;
    const curl = 0.15 * t * t;
    positions.push(-half, t - 0.5, curl, half, t - 0.5, curl);
    if (i < rows) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

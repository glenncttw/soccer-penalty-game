import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';
import { palette } from '../theme';

/** Kick puffs and perfect-strike glitter. */
export class Effects {
  readonly group = new THREE.Group();
  private readonly dust = new ParticlePool(160, THREE.NormalBlending);
  private readonly glitter = new ParticlePool(220, THREE.AdditiveBlending);
  private glitterDue = 0;

  constructor() {
    this.group.add(this.dust.points, this.glitter.points);
  }

  /** Drawing-buffer height in pixels; particle sizes are in metres and need it. */
  setViewportHeight(px: number) {
    this.dust.setViewportHeight(px);
    this.glitter.setViewportHeight(px);
  }

  /** Grass and dust kicked up from the penalty spot. */
  kickPuff(at: Vec3, groundY: number, power: number) {
    const count = Math.round(10 + power * 12);
    for (let i = 0; i < count; i++) {
      const grass = Math.random() < 0.45;
      this.dust.spawn({
        x: at.x + rand(-0.12, 0.12),
        y: groundY + 0.04,
        z: at.z + rand(-0.1, 0.1),
        vx: rand(-1.3, 1.3) * (0.6 + power),
        vy: rand(0.5, 1.8) * (0.6 + power),
        vz: rand(-0.4, 1.4) * (0.6 + power),
        size: grass ? rand(0.03, 0.05) : rand(0.05, 0.09),
        grow: grass ? 1 : 2.2,
        life: rand(0.35, 0.75),
        alpha: grass ? 1 : 0.55,
        color: grass ? 0x5dcb5e : 0xf4f6ea,
        gravity: grass ? 7 : 1.5,
        drag: grass ? 1.5 : 3.5,
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
    this.glitter.update(dt);
  }
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

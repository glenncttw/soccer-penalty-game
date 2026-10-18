import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';
import { palette } from '../theme';

/** How a shot's trail looks: harder strikes leave a wider, longer trail. */
export interface TrailStyle {
  /** Full width at the ball, in metres. */
  width: number;
  /** Seconds a point of the trail stays visible. */
  life: number;
  /** Colour at the edges and in the middle of the ribbon. */
  edge: number;
  core: number;
}

export function trailStyle(power: number, perfect: boolean): TrailStyle {
  if (perfect) return { width: 0.17, life: 0.8, edge: palette.gold, core: 0xfffbea };
  return { width: 0.07 + power * 0.05, life: 0.35 + power * 0.3, edge: 0xff4f9a, core: 0xffd3e6 };
}

// Points are at least this far apart (metres), so a long trail fits at any frame rate:
// 512 points cover 30 m, more than the fastest shot travels in the longest trail's life.
const MIN_STEP = 0.06;
const MAX_SAMPLES = 512;
/** Seconds the trail takes to pull itself in to the ball's first touch after the shot. */
const PULL_IN = 0.3;
/** Metres over which the trail grows in from nothing at its front end. */
const HEAD_TAPER = 0.3;
/**
 * Metres over which the back end fades in. Without it, right after the kick the trail's
 * oldest point is still young and bright, and the ribbon starts with a flat edge.
 */
const TAIL_TAPER = 1.5;

/**
 * A fading ribbon behind the ball that makes its curl visible. It always faces
 * the camera, and each point fades by age, so it looks the same at any frame rate.
 * Both ends taper off smoothly (also just after the kick), and once the ball touches something the trail stops
 * growing and pulls itself in to that spot.
 */
export class BallTrail {
  readonly mesh: THREE.Mesh;
  private readonly samples: { p: THREE.Vector3; t: number }[] = [];
  private readonly positions = new Float32Array(MAX_SAMPLES * 2 * 3);
  private readonly alphas = new Float32Array(MAX_SAMPLES * 2);
  private readonly uniforms = { edgeColor: { value: new THREE.Color() }, coreColor: { value: new THREE.Color() } };
  private style = trailStyle(0.5, false);
  /** Game time the trail stopped following the ball, or null while it follows. */
  private stoppedAt: number | null = null;
  private readonly tangent = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor() {
    const across = new Float32Array(MAX_SAMPLES * 2);
    for (let i = 0; i < MAX_SAMPLES; i++) across.set([-1, 1], i * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('across', new THREE.BufferAttribute(across, 1));
    const index: number[] = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float across;
        varying float vAlpha;
        varying float vAcross;
        void main() {
          vAlpha = alpha;
          vAcross = across;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 edgeColor;
        uniform vec3 coreColor;
        varying float vAlpha;
        varying float vAcross;
        void main() {
          float a = abs(vAcross);
          vec3 color = mix(coreColor, edgeColor, smoothstep(0.1, 0.8, a));
          gl_FragColor = vec4(color, vAlpha * (1.0 - smoothstep(0.7, 1.0, a)));
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.setStyle(this.style);
  }

  setStyle(style: TrailStyle) {
    this.style = style;
    this.uniforms.edgeColor.value.setHex(style.edge);
    this.uniforms.coreColor.value.setHex(style.core);
  }

  /** Adds the ball's position at game time `time` (seconds). */
  push(p: Vec3, time: number) {
    if (this.stoppedAt !== null) return;
    const newest = this.samples[0];
    if (newest && newest.p.distanceToSquared(p) < MIN_STEP * MIN_STEP) return;
    const reuse = this.samples.length >= MAX_SAMPLES ? this.samples.pop()! : { p: new THREE.Vector3(), t: 0 };
    reuse.p.set(p.x, p.y, p.z);
    reuse.t = time;
    this.samples.unshift(reuse);
  }

  /** Stops following the ball (at game time `time`): what's left pulls itself in and fades. */
  stop(time: number) {
    this.stoppedAt ??= time;
  }

  clear() {
    this.samples.length = 0;
    this.stoppedAt = null;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  /** Rebuilds the ribbon for game time `time`, facing `cameraPosition`. */
  update(time: number, cameraPosition: THREE.Vector3) {
    const { life, width } = this.style;
    // After a stop, the trail ages faster so even its newest point is gone within PULL_IN.
    const stopped = this.stoppedAt ?? time;
    const age = (t: number) => (stopped - t) + (time - stopped) * Math.max(1, life / PULL_IN);
    while (this.samples.length && age(this.samples[this.samples.length - 1].t) > life) this.samples.pop();
    const n = this.samples.length;
    let length = 0;
    for (let i = 1; i < n; i++) length += this.samples[i].p.distanceTo(this.samples[i - 1].p);
    const tailTaper = Math.min(TAIL_TAPER, 0.5 * length); // a short trail still shows its middle
    let along = 0; // metres from the front end
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      if (i > 0) along += s.p.distanceTo(this.samples[i - 1].p);
      const fade = Math.max(0, 1 - age(s.t) / life);
      const head = smoothstep(along / HEAD_TAPER) * smoothstep((length - along) / tailTaper);
      this.tangent.subVectors(this.samples[Math.max(0, i - 1)].p, this.samples[Math.min(n - 1, i + 1)].p);
      this.toCamera.subVectors(cameraPosition, s.p);
      this.side.crossVectors(this.tangent, this.toCamera);
      if (this.side.lengthSq() < 1e-10) this.side.set(0, 1, 0);
      this.side.normalize().multiplyScalar(0.5 * width * Math.pow(fade, 0.6) * (0.4 + 0.6 * head));
      this.positions.set(
        [s.p.x - this.side.x, s.p.y - this.side.y, s.p.z - this.side.z, s.p.x + this.side.x, s.p.y + this.side.y, s.p.z + this.side.z],
        i * 6,
      );
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = 0.9 * smoothstep(fade) * head;
    }
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, Math.max(0, n - 1) * 6); // only the segments between live points
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('alpha').needsUpdate = true;
  }
}

function smoothstep(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

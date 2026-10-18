import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';
import { simulateFlight } from '../physics/flight';
import { palette } from '../theme';

const PREVIEW_SHARE = 0.7; // only show the first part of the flight as a hint
const DOT_SPACING = 0.45; // metres between the preview's dots
const DOT_RADIUS = 0.06; // metres, at the ball end; they shrink a little toward the goal
const DOT_FLOW = 0.9; // metres per second the dots travel toward the goal
const MAX_DOTS = 48;
const START_GAP = 0.3; // metres from the ball's centre before the dots start, so none sits in the ball
const FADE_END = 1.5; // metres over which the dots fade out at the far end
const OUTLINE = 0x1f2a44; // the HUD's dark blue

export interface ReticleState {
  /** True while the player holds a shot. */
  charging: boolean;
  /** Current power meter value, 0..1. */
  power: number;
  /** True while the meter is in the gold zone. */
  perfect: boolean;
}

/**
 * The aim reticle on the goal and a dotted preview of the curl: chunky round dots with a dark
 * outline, like a cartoon, that march slowly toward the goal.
 */
export class AimMarkers {
  readonly group = new THREE.Group();
  private readonly reticle: THREE.Group;
  private readonly reticleMaterial: THREE.MeshBasicMaterial;
  private readonly preview: THREE.Mesh;
  private readonly previewGeometry = new THREE.InstancedBufferGeometry();
  private readonly dotCenters = new Float32Array(MAX_DOTS * 3);
  private readonly dotSizes = new Float32Array(MAX_DOTS);
  private readonly dotAlphas = new Float32Array(MAX_DOTS);
  private readonly dotUniforms = { fill: { value: new THREE.Color() }, outline: { value: new THREE.Color(OUTLINE) } };
  private readonly shown = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private time = 0;
  private wasPerfect = false;
  private pop = 0;

  constructor() {
    this.reticleMaterial = new THREE.MeshBasicMaterial({ color: palette.pink, depthTest: false, transparent: true });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 32), this.reticleMaterial);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), this.reticleMaterial);
    this.reticle = new THREE.Group();
    this.reticle.add(ring, dot);
    this.reticle.renderOrder = 10;
    ring.renderOrder = dot.renderOrder = 10;

    // One square per dot, always facing the camera; the shader cuts out a round dot with an outline.
    const geo = this.previewGeometry;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const dynamic = (array: Float32Array, size: number) =>
      new THREE.InstancedBufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('center', dynamic(this.dotCenters, 3));
    geo.setAttribute('size', dynamic(this.dotSizes, 1));
    geo.setAttribute('alpha', dynamic(this.dotAlphas, 1));
    geo.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.dotUniforms,
      vertexShader: /* glsl */ `
        attribute vec3 center;
        attribute float size;
        attribute float alpha;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vUv = position.xy;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(center, 1.0);
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 fill;
        uniform vec3 outline;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          float r = length(vUv);
          float aa = fwidth(r);
          float inside = 1.0 - smoothstep(1.0 - aa, 1.0, r);
          float rim = smoothstep(0.7 - aa, 0.7, r);
          gl_FragColor = vec4(mix(fill, outline, rim), inside * vAlpha);
          #include <colorspace_fragment>
        }`,
    });
    this.preview = new THREE.Mesh(geo, material);
    this.preview.frustumCulled = false;
    this.preview.renderOrder = 5;

    this.group.add(this.reticle, this.preview);
    this.hide();
  }

  /** Call once per frame before showing anything; drives the pulses and the dash flow. */
  update(dt: number) {
    this.time += dt;
    this.pop = Math.max(0, this.pop - dt * 5);
  }

  /**
   * Shows the reticle at `at`. While aiming it follows smoothly and breathes; while
   * charging it grows with power and turns gold in the perfect zone.
   */
  showReticle(at: Vec3, state: ReticleState, dt: number) {
    this.target.set(at.x, at.y, at.z);
    if (!this.reticle.visible || state.charging) this.shown.copy(this.target);
    else this.shown.lerp(this.target, 1 - Math.exp(-22 * dt));
    this.reticle.visible = true;
    this.reticle.position.set(this.shown.x, this.shown.y, this.shown.z + 0.05);

    if (state.perfect && !this.wasPerfect) this.pop = 1; // a little bump when the gold zone starts
    this.wasPerfect = state.perfect;
    const scale = state.charging
      ? 0.75 + 0.35 * state.power + 0.15 * this.pop
      : 1 + 0.06 * Math.sin(this.time * 4.5);
    this.reticle.scale.setScalar(scale);
    this.reticleMaterial.color.setHex(state.perfect ? palette.gold : palette.pink);
  }

  showPreview(start: Vec3, velocity: Vec3, spin: Vec3, perfect: boolean) {
    const pts: Vec3[] = [start];
    simulateFlight(start, velocity, spin, (p) => {
      pts.push({ ...p });
      return p.z <= 0;
    });
    const path = pts.slice(0, Math.max(2, Math.floor(pts.length * PREVIEW_SHARE)));
    const lengths = [0];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    const total = lengths[lengths.length - 1];
    // Dots every DOT_SPACING along the path, all shifted forward over time so they march toward the goal.
    let count = 0;
    let j = 1;
    for (let d = START_GAP + ((this.time * DOT_FLOW) % DOT_SPACING); d < total && count < MAX_DOTS; d += DOT_SPACING) {
      while (j < path.length - 1 && lengths[j] < d) j++;
      const a = path[j - 1];
      const b = path[j];
      const f = (d - lengths[j - 1]) / Math.max(lengths[j] - lengths[j - 1], 1e-6);
      this.dotCenters.set([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f], count * 3);
      const along = d / total;
      this.dotSizes[count] = DOT_RADIUS * (1 - 0.45 * along);
      // Grow in near the ball, fade out at the far end.
      this.dotAlphas[count] = smooth((d - START_GAP) / DOT_SPACING) * smooth((total - d) / FADE_END);
      count++;
    }
    const geo = this.previewGeometry;
    geo.instanceCount = count;
    for (const name of ['center', 'size', 'alpha']) geo.getAttribute(name).needsUpdate = true;
    this.dotUniforms.fill.value.setHex(perfect ? palette.gold : palette.white);
    this.preview.visible = true;
  }

  hide() {
    this.reticle.visible = false;
    this.preview.visible = false;
    this.wasPerfect = false;
  }
}

function smooth(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

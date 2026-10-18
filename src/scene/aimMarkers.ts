import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';
import { simulateFlight } from '../physics/flight';
import { palette } from '../theme';

const PREVIEW_SHARE = 0.7; // only show the first part of the flight as a hint
const DOT_SPACING = 0.45; // metres between the preview's dots
const DOT_RADIUS = 0.07; // metres, at the ball end; they shrink a little toward the goal
const DOT_FLOW = 0.9; // metres per second the dots travel toward the goal
const MAX_DOTS = 48;
const START_GAP = 0.3; // metres from the ball's centre before the dots start, so none sits in the ball
const FADE_END = 1.5; // metres over which the last dots fade out completely
/** Colours in the middle and at the soft edge of a dot, like the ball's trail: yellow, and paler in the gold zone. */
const DOT_COLORS = { normal: { core: 0xfff6d0, edge: 0xffd23f }, perfect: { core: 0xffffff, edge: 0xffe680 } };

export interface ReticleState {
  /** True while the player holds a shot. */
  charging: boolean;
  /** Current power meter value, 0..1. */
  power: number;
  /** True while the meter is in the gold zone. */
  perfect: boolean;
}

/**
 * The aim reticle on the goal and a dotted preview of the curl: soft glowing yellow beads in the
 * style of the ball's trail, getting smaller and fainter toward the goal, marching slowly along.
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
  private readonly dotUniforms = { core: { value: new THREE.Color() }, edge: { value: new THREE.Color() } };
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

    // One square per dot, always facing the camera; the shader draws a round dot with a pale middle and a soft edge.
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
        uniform vec3 core;
        uniform vec3 edge;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          float r = length(vUv);
          vec3 color = mix(core, edge, smoothstep(0.1, 0.75, r));
          gl_FragColor = vec4(color, vAlpha * (1.0 - smoothstep(0.65, 1.0, r)));
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
    const first = START_GAP + ((this.time * DOT_FLOW) % DOT_SPACING);
    const count = Math.min(MAX_DOTS, Math.max(0, Math.ceil((total - first) / DOT_SPACING)));
    const grow = perfect ? 1.15 : 1;
    let j = 1;
    for (let k = 0; k < count; k++) {
      const d = first + k * DOT_SPACING;
      while (j < path.length - 1 && lengths[j] < d) j++;
      const a = path[j - 1];
      const b = path[j];
      const f = (d - lengths[j - 1]) / Math.max(lengths[j] - lengths[j - 1], 1e-6);
      // Stored far end first: the dots are see-through and drawn in this order, so the nearer ones go on top.
      const i = count - 1 - k;
      this.dotCenters.set([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f], i * 3);
      const along = d / total;
      this.dotSizes[i] = DOT_RADIUS * grow * (1 - 0.4 * along);
      // Grow in near the ball, then fainter all the way toward the goal, gone at the far end.
      this.dotAlphas[i] = smooth((d - START_GAP) / DOT_SPACING) * (1 - 0.85 * along) * smooth((total - d) / FADE_END);
    }
    const geo = this.previewGeometry;
    geo.instanceCount = count;
    for (const name of ['center', 'size', 'alpha']) geo.getAttribute(name).needsUpdate = true;
    const colors = perfect ? DOT_COLORS.perfect : DOT_COLORS.normal;
    this.dotUniforms.core.value.setHex(colors.core);
    this.dotUniforms.edge.value.setHex(colors.edge);
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

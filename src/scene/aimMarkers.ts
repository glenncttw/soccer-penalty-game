import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';
import { simulateFlight } from '../physics/flight';
import { palette } from '../theme';

const PREVIEW_POINTS = 90;
const PREVIEW_SHARE = 0.7; // only show the first part of the flight as a hint
const DASH_FLOW = 1.6; // metres per second the preview dashes travel toward the goal

export interface ReticleState {
  /** True while the player holds a shot. */
  charging: boolean;
  /** Current power meter value, 0..1. */
  power: number;
  /** True while the meter is in the gold zone. */
  perfect: boolean;
}

/** The aim reticle on the goal and a dotted preview of the curl. */
export class AimMarkers {
  readonly group = new THREE.Group();
  private readonly reticle: THREE.Group;
  private readonly reticleMaterial: THREE.MeshBasicMaterial;
  private readonly preview: THREE.Line;
  private readonly previewMaterial: THREE.LineDashedMaterial;
  private readonly previewPositions = new Float32Array(PREVIEW_POINTS * 3);
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

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.previewPositions, 3));
    this.previewMaterial = new THREE.LineDashedMaterial({
      color: palette.white,
      dashSize: 0.25,
      gapSize: 0.18,
      transparent: true,
      opacity: 0.9,
    });
    this.preview = new THREE.Line(geo, this.previewMaterial);
    this.preview.frustumCulled = false;

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
    const pts: Vec3[] = [];
    simulateFlight(start, velocity, spin, (p) => {
      pts.push({ ...p });
      return p.z <= 0;
    });
    const n = Math.max(2, Math.floor(pts.length * PREVIEW_SHARE));
    for (let i = 0; i < PREVIEW_POINTS; i++) {
      const p = pts[Math.floor((i / (PREVIEW_POINTS - 1)) * (n - 1))] ?? start;
      this.previewPositions.set([p.x, p.y, p.z], i * 3);
    }
    this.preview.geometry.getAttribute('position').needsUpdate = true;
    this.preview.computeLineDistances();
    // Shift the dashes along the line so they flow toward the goal.
    const distances = this.preview.geometry.getAttribute('lineDistance') as THREE.BufferAttribute;
    const flow = (this.time * DASH_FLOW) % (this.previewMaterial.dashSize + this.previewMaterial.gapSize);
    for (let i = 0; i < distances.count; i++) distances.setX(i, distances.getX(i) - flow);
    distances.needsUpdate = true;
    this.previewMaterial.color.setHex(perfect ? palette.gold : palette.white);
    this.preview.visible = true;
  }

  hide() {
    this.reticle.visible = false;
    this.preview.visible = false;
    this.wasPerfect = false;
  }
}

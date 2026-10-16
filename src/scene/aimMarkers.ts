import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';
import { simulateFlight } from '../physics/flight';
import { palette } from '../theme';

const PREVIEW_POINTS = 90;
const PREVIEW_SHARE = 0.7; // only show the first part of the flight as a hint

/** The aim reticle on the goal and a dotted preview of the curl. */
export class AimMarkers {
  readonly group = new THREE.Group();
  private readonly reticle: THREE.Group;
  private readonly preview: THREE.Line;
  private readonly previewPositions = new Float32Array(PREVIEW_POINTS * 3);

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: palette.pink, depthTest: false, transparent: true });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 24), mat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), mat);
    this.reticle = new THREE.Group();
    this.reticle.add(ring, dot);
    this.reticle.renderOrder = 10;
    ring.renderOrder = dot.renderOrder = 10;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.previewPositions, 3));
    this.preview = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({ color: palette.white, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.9 }),
    );
    this.preview.frustumCulled = false;

    this.group.add(this.reticle, this.preview);
    this.hide();
  }

  showReticle(at: Vec3, charging: boolean) {
    this.reticle.visible = true;
    this.reticle.position.set(at.x, at.y, at.z + 0.05);
    this.reticle.scale.setScalar(charging ? 0.8 : 1);
  }

  showPreview(start: Vec3, velocity: Vec3, spin: Vec3) {
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
    this.preview.visible = true;
  }

  hide() {
    this.reticle.visible = false;
    this.preview.visible = false;
  }
}

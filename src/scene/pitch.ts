import * as THREE from 'three';
import { BOX_DEPTH, BOX_WIDTH, PENALTY_SPOT_Z, SIX_YARD_DEPTH, SIX_YARD_WIDTH } from '../dimensions';
import { palette } from '../theme';
import { flat } from './materials';

const PITCH_WIDTH = 68;
const PITCH_LENGTH = 52;
const STRIPE = 4;
const LINE = 0.12;

export function createPitch(): THREE.Group {
  const group = new THREE.Group();

  // Mowing stripes across the pitch
  const stripeGeo = new THREE.PlaneGeometry(PITCH_WIDTH, STRIPE);
  const mats = [flat(palette.grass), flat(palette.grassStripe)];
  for (let i = 0; i * STRIPE < PITCH_LENGTH + 8; i++) {
    const stripe = new THREE.Mesh(stripeGeo, mats[i % 2]);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0, -8 + STRIPE / 2 + i * STRIPE);
    stripe.receiveShadow = true;
    group.add(stripe);
  }

  // Markings
  const lineMat = new THREE.MeshBasicMaterial({ color: palette.lines });
  const line = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.005, z);
    group.add(m);
  };
  const rect = (w: number, d: number) => {
    line(0, d, w, LINE);
    line(-w / 2, d / 2, LINE, d);
    line(w / 2, d / 2, LINE, d);
  };
  line(0, 0, PITCH_WIDTH, LINE); // goal line
  rect(BOX_WIDTH, BOX_DEPTH);
  rect(SIX_YARD_WIDTH, SIX_YARD_DEPTH);

  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), lineMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.006, PENALTY_SPOT_Z);
  group.add(spot);

  // Penalty arc: the part of a 9.15 m circle around the spot outside the box
  const r = 9.15;
  const a = Math.acos((BOX_DEPTH - PENALTY_SPOT_Z) / r);
  const arc = new THREE.Mesh(new THREE.RingGeometry(r - LINE / 2, r + LINE / 2, 40, 1, Math.PI / 2 - a, 2 * a), lineMat);
  arc.rotation.x = Math.PI / 2;
  arc.position.set(0, 0.005, PENALTY_SPOT_Z);
  group.add(arc);

  return group;
}

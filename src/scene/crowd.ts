import * as THREE from 'three';
import { CROWD_SETTINGS, type CrowdSettings } from './crowdSettings';
import { findCrowdSpots, type CrowdSpot, type Triangles } from './crowdSpots';

/** The stand's concrete: its step floors, risers and stairs. */
const STAND_NODE = 'STATIC_Concrete';
/** Parts of the model a person in the stands can never bump into. */
const NOT_IN_THE_WAY = /^(PITCH_|GROUND_|STATIC_Markings|Football_Ball|CAM_|SUN_)/;

/**
 * A placeholder crowd: one coloured tube per person, standing in rows on the stand steps right
 * behind their barriers, until the real crowd is made. Spots come from the stadium's own geometry
 * (see crowdSpots.ts), so nobody stands in a barrier, a wall or on the stairs. All tubes are drawn
 * in one go, and they cast no shadows, to stay cheap.
 */
export class CrowdPlaceholder {
  readonly mesh: THREE.InstancedMesh;
  readonly spots: CrowdSpot[];

  constructor(stadium: THREE.Object3D, envMap: THREE.Texture | null, s: CrowdSettings = CROWD_SETTINGS) {
    stadium.updateMatrixWorld(true);
    const stand = stadium.getObjectByName(STAND_NODE);
    if (!stand) throw new Error(`Stadium model is missing the "${STAND_NODE}" node`);
    const obstacles: Triangles[] = [];
    stadium.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === stand || NOT_IN_THE_WAY.test(a.name)) return;
      obstacles.push(worldTriangles(o));
    });
    const tallest = s.height * (1 + s.heightVariation);
    this.spots = findCrowdSpots(worldTriangles(stand), obstacles, {
      rowHeights: s.rowHeights,
      radius: s.radius,
      height: tallest,
      spacing: s.spacing,
      clearance: s.clearance,
    });

    // A tube: a capsule standing on its bottom, made a little taller or shorter per person.
    const geometry = new THREE.CapsuleGeometry(s.radius, s.height - 2 * s.radius, 2, 8);
    geometry.translate(0, s.height / 2, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.8, envMap, envMapIntensity: 1 });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.spots.length);
    this.mesh.name = 'CrowdPlaceholder';
    const random = seeded(s.seed);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    this.spots.forEach((p, i) => {
      const tall = 1 + s.heightVariation * (random() * 2 - 1);
      matrix.makeScale(1, tall, 1).setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, color.set(s.colors[Math.floor(random() * s.colors.length)]));
    });
    this.mesh.computeBoundingSphere();
    this.mesh.visible = s.crowd;
  }
}

/** Every triangle of every mesh under `root`, in world positions. */
export function worldTriangles(root: THREE.Object3D): Triangles {
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const position = o.geometry.attributes.position;
    const index = o.geometry.index;
    const count = index ? index.count : position.count;
    for (let k = 0; k < count; k++) {
      v.fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return new Float32Array(out);
}

/** A small seeded random number generator (mulberry32), so the crowd looks the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

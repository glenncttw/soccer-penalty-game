import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CROWD_SETTINGS, type CrowdSettings } from './crowdSettings';
import { findCrowdSpots, shapeOf, type CrowdSpot, type PersonBox, type Triangles } from './crowdSpots';

/** The stand's concrete: its step floors, risers and stairs. */
const STAND_NODE = 'STATIC_Concrete';
/** Parts of the model a person in the stands can never bump into. */
const NOT_IN_THE_WAY = /^(PITCH_|GROUND_|STATIC_Markings|Football_Ball|CAM_|SUN_)/;
/** How close (0..1 per channel, in the texture's own colours) a texel must be to the shirt colour to count as shirt. */
const SHIRT_MATCH = 0.08;
/** The person's shape is measured in layers this high (see shapeOf). */
const SHAPE_SLICE = 0.1;

/**
 * The crowd: copies of Glenn's crowd person, standing in rows on the stand steps right behind
 * their barriers and facing the pitch. Spots come from the stadium's own geometry and the
 * person's own shape (see crowdSpots.ts), so nobody stands in a barrier, a wall or on the stairs.
 * All people are drawn in one go, each with their own shirt colour; they cast no shadows, to stay
 * cheap.
 */
export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  readonly spots: CrowdSpot[];

  constructor(stadium: THREE.Object3D, person: THREE.Object3D, envMap: THREE.Texture | null, s: CrowdSettings = CROWD_SETTINGS) {
    stadium.updateMatrixWorld(true);
    const stand = stadium.getObjectByName(STAND_NODE);
    if (!stand) throw new Error(`Stadium model is missing the "${STAND_NODE}" node`);
    const obstacles: Triangles[] = [];
    stadium.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === stand || NOT_IN_THE_WAY.test(a.name)) return;
      obstacles.push(worldTriangles(o));
    });

    const { geometry, material, shape } = mergePerson(person);
    const random = seeded(s.seed);
    this.spots = findCrowdSpots(worldTriangles(stand), obstacles, {
      rowHeights: s.rowHeights,
      shape,
      sizeVariation: s.sizeVariation,
      spacing: s.spacing,
      clearance: s.clearance,
      turn: THREE.MathUtils.degToRad(s.turn),
      random,
    });

    if (envMap) {
      material.envMap = envMap;
      material.envMapIntensity = 1;
    }
    if (s.shirtColors.length > 0) dressShirts(material, s.shirtColor);
    this.mesh = new THREE.InstancedMesh(geometry, material, this.spots.length);
    this.mesh.name = 'Crowd';
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const size = new THREE.Vector3();
    const color = new THREE.Color();
    this.spots.forEach((p, i) => {
      size.setScalar(p.size);
      matrix.compose(new THREE.Vector3(p.x, p.y, p.z), turn.setFromAxisAngle(up, p.angle), size);
      this.mesh.setMatrixAt(i, matrix);
      if (s.shirtColors.length > 0) this.mesh.setColorAt(i, color.set(s.shirtColors[Math.floor(random() * s.shirtColors.length)]));
    });
    this.mesh.computeBoundingSphere();
    this.mesh.visible = s.crowd;
  }
}

/**
 * The person's parts as one geometry (so the whole crowd is one draw), its one material, and its
 * shape: boxes per part, layer by layer, in the person's own space.
 */
function mergePerson(person: THREE.Object3D): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; shape: PersonBox[] } {
  person.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const shape: PersonBox[] = [];
  let material: THREE.MeshStandardMaterial | undefined;
  person.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!(o.material instanceof THREE.MeshStandardMaterial) || (material && o.material !== material)) {
      throw new Error(`Crowd person: every part needs the same one material ("${o.name}" has another)`);
    }
    material = o.material;
    // Only the shape itself: the face's shape keys (expressions) aren't used yet.
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = o.geometry.getAttribute(name);
      if (!attribute) throw new Error(`Crowd person: part "${o.name}" has no ${name}`);
      g.setAttribute(name, attribute.clone());
    }
    g.setIndex(o.geometry.index);
    g.applyMatrix4(o.matrixWorld);
    shape.push(...shapeOf(worldTriangles(new THREE.Mesh(g)), SHAPE_SLICE));
    parts.push(g);
  });
  if (!material || parts.length === 0) throw new Error('Crowd person has no meshes');
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('Crowd person: its parts could not be put together');
  return { geometry, material, shape };
}

/** Swaps the texture's shirt colour for each person's own colour (their instance colour); the rest stays as painted. */
function dressShirts(material: THREE.MeshStandardMaterial, shirtColor: string) {
  const shirt = new THREE.Color(shirtColor); // in the working (linear) colours, like the texture once read
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShirt = { value: shirt };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uShirt;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        `#ifdef USE_COLOR
          if (all(lessThan(abs(diffuseColor.rgb - uShirt), vec3(${SHIRT_MATCH})))) diffuseColor.rgb = vColor.rgb;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'crowd-shirts';
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

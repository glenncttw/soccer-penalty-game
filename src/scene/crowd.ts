import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CROWD_SETTINGS, type CrowdSettings } from './crowdSettings';
import { addMotion, limbAt, motionOf, motionUniforms, reachablePoses } from './crowdMotion';
import {
  concat,
  findCrowdSpots,
  shapeOf,
  type CrowdSpot,
  type Moves,
  type PersonBox,
  type Triangles,
} from './crowdSpots';

/** The stand's concrete: its step floors, risers and stairs. */
const STAND_NODE = 'STATIC_Concrete';
/** Parts of the model a person in the stands can never bump into. */
const NOT_IN_THE_WAY = /^(PITCH_|GROUND_|STATIC_Markings|Football_Ball|CAM_|SUN_)/;
/** How close (0..1 per channel, in the texture's own colours) a texel must be to the shirt colour to count as shirt. */
const SHIRT_MATCH = 0.08;
/** The person's shape is measured in layers this high (see shapeOf). */
const SHAPE_SLICE = 0.1;

/**
 * The crowd: copies of Glenn's crowd person, standing in rows on the stand steps behind their
 * barriers, roughly facing the pitch, and moving (see crowdMotion.ts). Spots come from the
 * stadium's own geometry and the room the person needs while moving (see crowdSpots.ts), so nobody
 * stands in a barrier, a wall or on the stairs, or reaches into one or into each other. All people
 * are drawn in one go, each with their own shirt colour and timing; they cast no shadows, to stay
 * cheap.
 */
export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  readonly spots: CrowdSpot[];
  /** What the people's room was measured against: the stadium's triangles (stand included), and the person's shape for each way of moving. */
  readonly room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]> };
  private readonly motion: ReturnType<typeof motionUniforms>;

  constructor(
    stadium: THREE.Object3D,
    person: THREE.Object3D,
    envMap: THREE.Texture | null,
    s: CrowdSettings = CROWD_SETTINGS,
  ) {
    stadium.updateMatrixWorld(true);
    const stand = stadium.getObjectByName(STAND_NODE);
    if (!stand) throw new Error(`Stadium model is missing the "${STAND_NODE}" node`);
    const obstacles: Triangles[] = [];
    stadium.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === stand || NOT_IN_THE_WAY.test(a.name)) return;
      obstacles.push(worldTriangles(o));
    });

    const { geometry, material, shapes } = mergePerson(person, s);
    const random = seeded(s.seed);
    const steps = worldTriangles(stand);
    this.room = { stadium: concat([steps, ...obstacles]), shapes };
    this.spots = findCrowdSpots(steps, obstacles, {
      rowHeights: s.rowHeights,
      shapes,
      cheerShare: s.motion ? s.cheerShare : 0,
      sizeVariation: s.sizeVariation,
      spacing: s.spacing,
      spacingJitter: s.spacingJitter,
      depthJitter: s.depthJitter,
      gaps: s.gaps,
      clearance: s.clearance,
      turn: THREE.MathUtils.degToRad(s.turn),
      random,
    });

    if (envMap) {
      material.envMap = envMap;
      material.envMapIntensity = 1;
    }
    this.motion = motionUniforms(s);
    dress(material, s, this.motion);
    const timing = new Float32Array(this.spots.length * 4);
    this.spots.forEach((p, i) => timing.set(motionOf(random, p.moves), i * 4));
    geometry.setAttribute('aMotion', new THREE.InstancedBufferAttribute(timing, 4));
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
      if (s.shirtColors.length > 0)
        this.mesh.setColorAt(i, color.set(s.shirtColors[Math.floor(random() * s.shirtColors.length)]));
    });
    this.mesh.computeBoundingSphere();
    this.mesh.visible = s.crowd;
  }

  /** Moves the crowd along to the game's time (so slow motion slows them too). */
  update(time: number) {
    this.motion.uCrowdTime.value = time;
  }
}

/**
 * The person's parts as one geometry (so the whole crowd is one draw), with each vertex marked with
 * its part's kind and origin for the moves; its one material; and its shape: boxes per part, layer
 * by layer, in the person's own space, taking in every pose the part can move to.
 */
function mergePerson(
  person: THREE.Object3D,
  s: CrowdSettings,
): {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  shapes: Record<Moves, PersonBox[]>;
} {
  person.updateMatrixWorld(true);
  const toPerson = person.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  const shapes: Record<Moves, PersonBox[]> = { cheer: [], move: [], calm: [] };
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
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toPerson, o.matrixWorld));
    // A part moves about the origin of the outermost part it sits in (the hair moves with the head).
    let outer: THREE.Object3D = o;
    for (let a = o.parent; a && a !== person; a = a.parent) if (a instanceof THREE.Mesh) outer = a;
    const pivot = new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().multiplyMatrices(toPerson, outer.matrixWorld),
    );
    const limb = limbAt(pivot);
    const count = g.getAttribute('position').count;
    g.setAttribute(
      'aPivot',
      new THREE.Float32BufferAttribute(Array.from({ length: count }, () => pivot.toArray()).flat(), 3),
    );
    g.setAttribute('aLimb', new THREE.Float32BufferAttribute(new Array<number>(count).fill(limb), 1));
    const triangles = worldTriangles(new THREE.Mesh(g));
    for (const moves of ['cheer', 'move', 'calm'] as const)
      shapes[moves].push(...shapeOf(posed(triangles, reachablePoses(limb, pivot, s, moves)), SHAPE_SLICE));
    parts.push(g);
  });
  if (!material || parts.length === 0) throw new Error('Crowd person has no meshes');
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('Crowd person: its parts could not be put together');
  return { geometry, material, shapes };
}

/** The triangles in every one of the poses, all in one list. */
function posed(triangles: Triangles, poses: THREE.Matrix4[]): Triangles {
  const out = new Float32Array(triangles.length * poses.length);
  const v = new THREE.Vector3();
  poses.forEach((pose, n) => {
    for (let k = 0; k < triangles.length; k += 3)
      v.fromArray(triangles, k)
        .applyMatrix4(pose)
        .toArray(out, n * triangles.length + k);
  });
  return out;
}

/**
 * Adds the moves to the material, and swaps the texture's shirt colour for each person's own
 * colour (their instance colour); the rest stays as painted.
 */
function dress(material: THREE.MeshStandardMaterial, s: CrowdSettings, motion: ReturnType<typeof motionUniforms>) {
  const shirt = new THREE.Color(s.shirtColor); // in the working (linear) colours, like the texture once read
  const shirts = s.shirtColors.length > 0;
  material.onBeforeCompile = (shader) => {
    addMotion(shader, motion);
    if (!shirts) return;
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
  material.customProgramCacheKey = () => `crowd${shirts ? '-shirts' : ''}`;
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
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

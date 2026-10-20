import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CrowdParts } from './crowdAsset';
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
/** The node in the crowd person's body that the head pieces sit on. */
const HEAD_NODE = 'Head';
/**
 * The colour slots in the person's `_REGION` attribute, and each one's colour in the texture
 * (crowd_manifest.json): a slot's texels are painted this colour, and each person's own colour for
 * the slot takes its place. Slot 0 (eyes, mouth) keeps the texture as it is.
 */
const Slot = { Fixed: 0, Skin: 1, Shirt: 2, Shorts: 3, Shoe: 4, Sock: 5, Hair: 6, Hat: 7, Accent: 8 } as const;
const SLOT_TEXTURE_COLORS = [
  '#000000',
  '#f6a464',
  '#1123eb',
  '#1123eb',
  '#1123eb',
  '#ebebeb',
  '#672a0f',
  '#1123eb',
  '#1123eb',
];
/** The person's shape is measured in layers this high (see shapeOf). */
const SHAPE_SLICE = 0.1;

/**
 * The crowd: copies of Glenn's crowd person, each with one of the head pieces (hair or a hat),
 * standing in rows on the stand steps behind their barriers, roughly facing the pitch, and moving
 * (see crowdMotion.ts). Spots come from the stadium's own geometry and the room each look needs
 * while moving (see crowdSpots.ts), so nobody stands in a barrier, a wall or on the stairs, or
 * reaches into one or into each other. Each look is drawn in one go (one draw per head piece), with
 * everyone's own skin, hair and shirt colours and timing, all from one material and texture; they
 * cast no shadows, to stay cheap.
 */
export class Crowd {
  /** All the crowd's people: one mesh per look. */
  readonly group = new THREE.Group();
  readonly spots: CrowdSpot[];
  /**
   * What the people's room was measured against: the stadium's triangles (stand included), and
   * each look's shape for each way of moving (by the spots' `look`).
   */
  readonly room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] };
  private readonly motion: ReturnType<typeof motionUniforms>;

  constructor(
    stadium: THREE.Object3D,
    parts: CrowdParts,
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

    const material = sharedMaterial(parts.base);
    const measured: Measured = new Map();
    const looks = parts.heads.map((head) => mergePerson(wearing(parts.base, head), s, measured));
    if (looks.length === 0)
      throw new Error('The crowd needs at least one head piece (see `heads` in crowdSettings.ts)');
    const random = seeded(s.seed);
    const steps = worldTriangles(stand);
    this.room = { stadium: concat([steps, ...obstacles]), shapes: looks.map((l) => l.shapes) };
    this.spots = findCrowdSpots(steps, obstacles, {
      rowHeights: s.rowHeights,
      looks: looks.map((l, i) => ({ shapes: l.shapes, share: s.heads[i]?.share ?? 1 })),
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
    // Everyone's own timing and colours, drawn from the same random numbers every time.
    const pick = (list: string[], fallback: string) => list[Math.floor(random() * list.length)] ?? fallback;
    const own = this.spots.map((p) => ({
      motion: motionOf(random, p.moves),
      skin: new THREE.Color(pick(s.skinColors, SLOT_TEXTURE_COLORS[Slot.Skin])),
      hair: new THREE.Color(pick(s.hairColors, SLOT_TEXTURE_COLORS[Slot.Hair])),
      shirt: new THREE.Color(pick(s.shirtColors, SLOT_TEXTURE_COLORS[Slot.Shirt])),
    }));
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const size = new THREE.Vector3();
    looks.forEach((l, look) => {
      const people = this.spots.map((p, i) => ({ p, i })).filter(({ p }) => p.look === look);
      if (people.length === 0) return;
      const geometry = l.geometry;
      const motion = new Float32Array(people.length * 4);
      const colors = {
        aSkin: new Float32Array(people.length * 3),
        aHair: new Float32Array(people.length * 3),
        aShirt: new Float32Array(people.length * 3),
      };
      people.forEach(({ i }, k) => {
        motion.set(own[i].motion, k * 4);
        own[i].skin.toArray(colors.aSkin, k * 3);
        own[i].hair.toArray(colors.aHair, k * 3);
        own[i].shirt.toArray(colors.aShirt, k * 3);
      });
      geometry.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motion, 4));
      for (const [name, values] of Object.entries(colors))
        geometry.setAttribute(name, new THREE.InstancedBufferAttribute(values, 3));
      const mesh = new THREE.InstancedMesh(geometry, material, people.length);
      mesh.name = `Crowd_${s.heads[look]?.file ?? look}`;
      people.forEach(({ p }, k) => {
        size.setScalar(p.size);
        matrix.compose(new THREE.Vector3(p.x, p.y, p.z), turn.setFromAxisAngle(up, p.angle), size);
        mesh.setMatrixAt(k, matrix);
      });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    });
    this.group.name = 'Crowd';
    this.group.visible = s.crowd;
  }

  /** Moves the crowd along to the game's time (so slow motion slows them too). */
  update(time: number) {
    this.motion.uCrowdTime.value = time;
  }
}

/** Parts already measured, by their mesh's geometry: every look has the same body, so it's only measured once. */
type Measured = Map<THREE.BufferGeometry, { part: THREE.BufferGeometry; shapes: Record<Moves, PersonBox[]> }>;

/**
 * One look's parts as one geometry (so each look is one draw), with each vertex marked with its
 * part's kind and origin for the moves; and its shape: boxes per part, layer by layer, in the
 * person's own space, taking in every pose the part can move to.
 */
function mergePerson(
  person: THREE.Object3D,
  s: CrowdSettings,
  measured: Measured,
): {
  geometry: THREE.BufferGeometry;
  shapes: Record<Moves, PersonBox[]>;
} {
  person.updateMatrixWorld(true);
  const toPerson = person.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  const shapes: Record<Moves, PersonBox[]> = { cheer: [], move: [], calm: [] };
  person.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const known = measured.get(o.geometry);
    if (known) {
      for (const moves of ['cheer', 'move', 'calm'] as const) shapes[moves].push(...known.shapes[moves]);
      parts.push(known.part);
      return;
    }
    // Only the shape itself (and its colour slots): the face's shape keys (expressions) aren't used yet.
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', '_region']) {
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
    const own = { part: g, shapes: { cheer: [], move: [], calm: [] } as Record<Moves, PersonBox[]> };
    for (const moves of ['cheer', 'move', 'calm'] as const) {
      own.shapes[moves] = shapeOf(posed(triangles, reachablePoses(limb, pivot, s, moves)), SHAPE_SLICE);
      shapes[moves].push(...own.shapes[moves]);
    }
    measured.set(o.geometry, own);
    parts.push(g);
  });
  if (parts.length === 0) throw new Error('Crowd person has no meshes');
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('Crowd person: its parts could not be put together');
  return { geometry, shapes };
}

/** The body wearing a head piece: the piece sits on the head, as made in the head's own space (it moves with it). */
function wearing(base: THREE.Object3D, piece: THREE.Mesh): THREE.Object3D {
  const person = base.clone();
  const head = person.getObjectByName(HEAD_NODE);
  if (!head) throw new Error(`Crowd person is missing its "${HEAD_NODE}" node`);
  const worn = piece.clone();
  worn.position.set(0, 0, 0);
  worn.quaternion.identity();
  worn.scale.set(1, 1, 1);
  head.add(worn);
  return person;
}

/** The one material all the crowd's parts share (the body's: the head pieces use the same texture). */
function sharedMaterial(base: THREE.Object3D): THREE.MeshStandardMaterial {
  let material: THREE.MeshStandardMaterial | undefined;
  base.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!(o.material instanceof THREE.MeshStandardMaterial) || (material && o.material !== material)) {
      throw new Error(`Crowd person: every part needs the same one material ("${o.name}" has another)`);
    }
    material = o.material;
  });
  if (!material) throw new Error('Crowd person has no meshes');
  return material;
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
 * Adds the moves to the material, and gives each person their own colours: each colour slot's
 * texels (see SLOT_TEXTURE_COLORS) take the person's colour for it, keeping the texture's own light
 * and dark (its brightness against the slot's colour, so the texture's small colour errors on a
 * channel the slot barely has can't show up as blotches); the eyes and mouth stay as painted.
 */
function dress(material: THREE.MeshStandardMaterial, s: CrowdSettings, motion: ReturnType<typeof motionUniforms>) {
  const luma = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const slotBrightness = SLOT_TEXTURE_COLORS.map((hex, slot) => (slot === Slot.Fixed ? 1 : luma(new THREE.Color(hex))));
  const sock = new THREE.Color(s.sockColor);
  const accent = new THREE.Color(s.accentColor);
  material.onBeforeCompile = (shader) => {
    addMotion(shader, motion);
    shader.uniforms.uSlotBrightness = { value: slotBrightness };
    shader.uniforms.uSock = { value: sock };
    shader.uniforms.uAccent = { value: accent };
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float _region;
        attribute vec3 aSkin, aHair, aShirt;
        uniform float uSlotBrightness[${SLOT_TEXTURE_COLORS.length}];
        uniform vec3 uSock, uAccent;
        varying vec3 vCrowdColor;
        varying float vCrowdSlotBrightness; // 0 where the texture stays as painted
        void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        int crowdSlot = int(_region + 0.5);
        vCrowdColor = crowdSlot == ${Slot.Skin} ? aSkin
          : crowdSlot == ${Slot.Hair} ? aHair
          : crowdSlot == ${Slot.Sock} ? uSock
          : crowdSlot == ${Slot.Accent} ? uAccent
          : aShirt; // shirt, shorts, shoes and hats
        vCrowdSlotBrightness = crowdSlot == ${Slot.Fixed} ? 0.0 : uSlotBrightness[crowdSlot];`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vCrowdColor;\nvarying float vCrowdSlotBrightness;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (vCrowdSlotBrightness > 0.0) {
          diffuseColor.rgb = vCrowdColor * dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / vCrowdSlotBrightness;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'crowd-slots';
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

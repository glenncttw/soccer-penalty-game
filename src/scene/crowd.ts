import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CrowdParts } from './crowdAsset';
import { CROWD_SETTINGS, type CrowdSettings } from './crowdSettings';
import {
  addMotion,
  holdingPose,
  Limb,
  limbAt,
  Mood,
  motionOf,
  motionUniforms,
  Party,
  reachablePoses,
} from './crowdMotion';
import {
  concat,
  findCrowdSpots,
  shapeOf,
  rectsOverlap,
  TriangleIndex,
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
/** Anything this far above a step's floor is in the way of the people on it (as when they're put there). */
const FLOOR_GAP = 0.02;
/** The uniforms that come from the reaction settings (see `tune`). */
const REACTION_UNIFORMS = [
  'uReactDelay',
  'uGoalShout',
  'uShoutShare',
  'uSaveSulk',
  'uFrownShare',
  'uRestSmile',
  'uJumps',
  'uJumpTime',
  'uJumpHeight',
  'uWaveLap',
  'uWaveLaps',
  'uWaveWidth',
  'uWaveRise',
] as const;
/** The face's shape keys in crowd_base.glb (on the head), in the order crowdMotion.ts reads them. */
const FACES = ['Surprised_O', 'Frown', 'Smile_Closed', 'Cheer_Open'];
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
  /** How a person holds a flag (see `hold`), in their own space. */
  readonly holding: Holding;
  private readonly motion: ReturnType<typeof motionUniforms>;
  /** Where each person's flag-bearing numbers are: their look's `aHold` and their place in it. */
  private readonly holds: { attribute: THREE.InstancedBufferAttribute; k: number }[] = [];
  private waveChance: number;

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
    this.holding = holdingOf(
      looks[0].arms,
      looks.map((l) => l.still),
    );
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
    this.waveChance = s.waveChance;
    dress(material, s, this.motion);
    // Everyone's own timing and colours, drawn from the same random numbers every time.
    const pick = (list: string[], fallback: string) => list[Math.floor(random() * list.length)] ?? fallback;
    const own = this.spots.map((p) => ({
      motion: motionOf(random, p.moves),
      skin: new THREE.Color(pick(s.skinColors, SLOT_TEXTURE_COLORS[Slot.Skin])),
      hair: new THREE.Color(pick(s.hairColors, SLOT_TEXTURE_COLORS[Slot.Hair])),
      shirt: new THREE.Color(pick(s.shirtColors, SLOT_TEXTURE_COLORS[Slot.Shirt])),
    }));
    const around = aroundTheStands(this.spots);
    const headroom = roomToJump(this.spots, this.room, Math.max(s.jumpHeight, s.waveRise));
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
        aSkin: new Float32Array(people.length * 4), // and where they stand along the stands
        aHair: new Float32Array(people.length * 4), // and how much of a jump they have room for
        aShirt: new Float32Array(people.length * 3),
      };
      people.forEach(({ i }, k) => {
        motion.set(own[i].motion, k * 4);
        own[i].skin.toArray(colors.aSkin, k * 4);
        colors.aSkin[k * 4 + 3] = around[i];
        own[i].hair.toArray(colors.aHair, k * 4);
        colors.aHair[k * 4 + 3] = headroom[i];
        own[i].shirt.toArray(colors.aShirt, k * 3);
      });
      geometry.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motion, 4));
      const hold = new THREE.InstancedBufferAttribute(new Float32Array(people.length * 4), 4);
      geometry.setAttribute('aHold', hold);
      people.forEach(({ i }, k) => (this.holds[i] = { attribute: hold, k }));
      for (const [name, values] of Object.entries(colors))
        geometry.setAttribute(name, new THREE.InstancedBufferAttribute(values, values.length / people.length));
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

  /**
   * Makes someone a flag bearer: holding the pole up beside them on `side` (1: their left, -1: their right) in
   * their hand (see `holding`), standing still but for lifting it up and down as the flag does: `lift` metres,
   * `often` times a second, from `start` (0..1) in it.
   */
  hold(person: number, side: 1 | -1, lift: number, often: number, start: number) {
    const h = this.holds[person];
    if (!h) throw new Error(`Crowd: no person ${person} to hold a flag`);
    h.attribute.setXYZW(h.k, side, lift, often, start);
    h.attribute.needsUpdate = true;
  }

  /**
   * The crowd reacts to a shot: after a goal they shout, and jump or do a Mexican wave (`party`: picked at random
   * unless given; none with `still`, for people who'd rather not see much moving); after a save they go "ooh!" and
   * most look disappointed.
   */
  react(result: 'goal' | 'saved', { still = false, party }: { still?: boolean; party?: Party } = {}) {
    const u = this.motion;
    u.uReactAt.value = u.uCrowdClock.value;
    u.uReactEnd.value = 1e9;
    u.uMood.value = result === 'goal' ? Mood.Goal : Mood.Save;
    u.uParty.value =
      result !== 'goal' || still ? Party.None : (party ?? (Math.random() < this.waveChance ? Party.Wave : Party.Jump));
    u.uWaveDir.value = Math.random() < 0.5 ? 1 : -1;
  }

  /** Changes how they react (the reaction settings in `s`), from the next reaction on. */
  tune(s: CrowdSettings) {
    const fresh = motionUniforms(s);
    for (const key of REACTION_UNIFORMS) this.motion[key].value = fresh[key].value;
    this.waveChance = s.waveChance;
  }

  /** Back to how they were before the shot, easing out of whatever they're doing. */
  calm() {
    const u = this.motion;
    if (u.uReactEnd.value > u.uCrowdClock.value) u.uReactEnd.value = u.uCrowdClock.value;
  }

  /**
   * Moves the crowd along: their own moves to the game's time (so slow motion slows them too), their reactions
   * to the real time (so a goal's slow motion doesn't make them float).
   */
  update(time: number, realDt: number) {
    this.motion.uCrowdTime.value = time;
    this.motion.uCrowdClock.value += realDt;
  }
}

/**
 * How much of a jump `highest` metres high each person has room for (0..1): a few have something just above
 * them (a rail, someone in the row behind), so they jump less high.
 */
function roomToJump(
  spots: CrowdSpot[],
  room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] },
  highest: number,
): number[] {
  if (highest <= 0) return spots.map(() => 1);
  const stadium = new TriangleIndex(room.stadium);
  const placed = spots.map((p) =>
    room.shapes[p.look][p.moves].map((b) => ({
      rect: {
        x: p.x,
        z: p.z,
        angle: p.angle,
        x0: b.x0 * p.size,
        x1: b.x1 * p.size,
        z0: b.z0 * p.size,
        z1: b.z1 * p.size,
      },
      // Their feet stand on the step: only what's above it can get in the way, as when they were put there.
      lo: Math.max(p.y + b.y0 * p.size, p.y + FLOOR_GAP),
      hi: p.y + b.y1 * p.size,
      feet: p.y + b.y0 * p.size,
    })),
  );
  const step = 0.01; // and the room they keep from anyone above
  return spots.map((p, i) => {
    let most = highest;
    // Someone in a row higher up right above part of them (people in the same row jump with them).
    for (const [j, q] of spots.entries()) {
      if (q.y <= p.y || Math.abs(q.x - p.x) > 1.5 || Math.abs(q.z - p.z) > 1.5) continue;
      for (const a of placed[i])
        for (const b of placed[j])
          if (b.feet >= a.hi && rectsOverlap(a.rect, b.rect)) most = Math.min(most, b.feet - a.hi - step);
    }
    // The stadium: all the way up in one go (the space they pass through), else a centimetre at a time.
    const hits = (lift: number) => placed[i].some((b) => stadium.touches(b.rect, b.lo, b.hi + lift));
    if (most > 0 && hits(most)) {
      let free = 0;
      while (!hits(Math.min(free + step, most))) free += step;
      return free / highest;
    }
    return Math.max(0, most) / highest;
  });
}

/**
 * Where each person stands along the stands, from 0 (the left side near the camera) round behind the goal to 1
 * (the right side): by the direction they're in, seen from the middle of the crowd.
 */
function aroundTheStands(spots: CrowdSpot[]): number[] {
  const middleZ = spots.reduce((sum, p) => sum + p.z, 0) / Math.max(spots.length, 1);
  const angles = spots.map((p) => Math.atan2(p.x, middleZ - p.z));
  const lo = Math.min(...angles);
  const hi = Math.max(...angles);
  return angles.map((a) => (hi > lo ? (a - lo) / (hi - lo) : 0.5));
}

/** Parts already measured, by their mesh's geometry: every look has the same body, so it's only measured once. */
type Measured = Map<
  THREE.BufferGeometry,
  { part: THREE.BufferGeometry; shapes: Record<Moves, PersonBox[]>; still: PersonBox[]; arm?: Arm }
>;

/** An arm: where it turns (its shoulder) and its triangles, in the person's own space. */
interface Arm {
  pivot: THREE.Vector3;
  triangles: Triangles;
}

/**
 * How a person holds a flag, in their own space (size 1), for each side (1: their left, -1: their right): where
 * the hand holding the pole is, and the room the raised arm takes. And each look's room standing still without
 * the arms (the head, hair or hat and the body), which the pole mustn't go through.
 */
export interface Holding {
  hand: Record<1 | -1, THREE.Vector3>;
  arm: Record<1 | -1, PersonBox[]>;
  still: PersonBox[][];
}

/** The hand is the arm's lowest part (hanging down), this far up from its bottom. */
const HAND = 0.06;

function holdingOf(arms: Arm[], still: PersonBox[][]): Holding {
  const side = (s: 1 | -1) => {
    const arm = arms.find((a) => Math.sign(a.pivot.x) === s);
    if (!arm) throw new Error(`Crowd person has no ${s > 0 ? 'left' : 'right'} arm to hold a flag with`);
    const t = arm.triangles;
    let low = Infinity;
    for (let i = 1; i < t.length; i += 3) low = Math.min(low, t[i]);
    const hand = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < t.length; i += 3) {
      if (t[i + 1] > low + HAND) continue;
      hand.x += t[i];
      hand.y += t[i + 1];
      hand.z += t[i + 2];
      count++;
    }
    const pose = holdingPose(arm.pivot);
    return { hand: hand.divideScalar(count).applyMatrix4(pose), arm: shapeOf(posed(t, [pose]), SHAPE_SLICE) };
  };
  const left = side(1);
  const right = side(-1);
  return { hand: { 1: left.hand, [-1]: right.hand }, arm: { 1: left.arm, [-1]: right.arm }, still };
}

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
  still: PersonBox[];
  arms: Arm[];
} {
  person.updateMatrixWorld(true);
  const toPerson = person.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  const shapes: Record<Moves, PersonBox[]> = { cheer: [], move: [], calm: [] };
  const still: PersonBox[] = [];
  const arms: Arm[] = [];
  person.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const known = measured.get(o.geometry);
    if (known) {
      for (const moves of ['cheer', 'move', 'calm'] as const) shapes[moves].push(...known.shapes[moves]);
      still.push(...known.still);
      if (known.arm) arms.push(known.arm);
      parts.push(known.part);
      return;
    }
    // The shape itself, its colour slots and the face's shape keys (expressions), as offsets the shader adds.
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', '_region']) {
      if (!o.geometry.getAttribute(name)) throw new Error(`Crowd person: part "${o.name}" has no ${name}`);
      if (name !== '_region') g.setAttribute(name, o.geometry.getAttribute(name).clone());
    }
    g.setIndex(o.geometry.index);
    const toPart = new THREE.Matrix4().multiplyMatrices(toPerson, o.matrixWorld);
    // The four faces' offsets, packed into three vec4s (a graphics card takes only 16 attributes).
    const faces = FACES.map((key) => faceOffsets(o, key, toPart));
    const packed = [0, 1, 2].map(() => new Float32Array((faces[0].length / 3) * 4));
    faces.forEach((face, f) =>
      face.forEach((v, i) => {
        const at = Math.floor(i / 3) * 12 + f * 3 + (i % 3); // the vertex's 12 numbers, face after face
        packed[Math.floor((at % 12) / 4)][Math.floor(at / 12) * 4 + (at % 4)] = v;
      }),
    );
    packed.forEach((values, n) => g.setAttribute(`aFace${n}`, new THREE.Float32BufferAttribute(values, 4)));
    g.applyMatrix4(toPart);
    // A part moves about the origin of the outermost part it sits in (the hair moves with the head).
    let outer: THREE.Object3D = o;
    for (let a = o.parent; a && a !== person; a = a.parent) if (a instanceof THREE.Mesh) outer = a;
    const pivot = new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().multiplyMatrices(toPerson, outer.matrixWorld),
    );
    const limb = limbAt(pivot);
    const count = g.getAttribute('position').count;
    // Where it moves about, and (packed, see crowdMotion.ts) the kind of part and each vertex's colour slot.
    const region = o.geometry.getAttribute('_region');
    g.setAttribute(
      'aPivot',
      new THREE.Float32BufferAttribute(
        Array.from({ length: count }, (_, i) => [...pivot.toArray(), limb * 16 + Math.round(region.getX(i))]).flat(),
        4,
      ),
    );
    const triangles = worldTriangles(new THREE.Mesh(g));
    const own = {
      part: g,
      shapes: { cheer: [], move: [], calm: [] } as Record<Moves, PersonBox[]>,
      still: limb === Limb.Arm ? [] : shapeOf(triangles, SHAPE_SLICE),
      arm: limb === Limb.Arm ? { pivot, triangles } : undefined,
    };
    still.push(...own.still);
    if (own.arm) arms.push(own.arm);
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
  return { geometry, shapes, still, arms };
}

/**
 * How far the shape key `key` moves each of `part`'s vertices, turned and sized into the person's space by
 * `toPerson` (none for parts without it: only the head has the face's).
 */
function faceOffsets(part: THREE.Mesh, key: string, toPerson: THREE.Matrix4): Float32Array {
  const count = part.geometry.getAttribute('position').count;
  const out = new Float32Array(count * 3);
  const index = part.morphTargetDictionary?.[key];
  const target = index === undefined ? undefined : part.geometry.morphAttributes.position?.[index];
  if (!target) {
    if (part.name === HEAD_NODE) throw new Error(`Crowd person: the head has no "${key}" shape key`);
    return out;
  }
  const turn = new THREE.Matrix3().setFromMatrix4(toPerson);
  const v = new THREE.Vector3();
  const base = part.geometry.getAttribute('position');
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(target, i);
    // Blender's shape keys come as offsets; some exports give the moved positions instead.
    if (!part.geometry.morphTargetsRelative) v.sub(new THREE.Vector3().fromBufferAttribute(base, i));
    v.applyMatrix3(turn).toArray(out, i * 3);
  }
  return out;
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
        `attribute vec3 aShirt; // aSkin and aHair are with the moves (see crowdMotion.ts)
        uniform float uSlotBrightness[${SLOT_TEXTURE_COLORS.length}];
        uniform vec3 uSock, uAccent;
        varying vec3 vCrowdColor;
        varying float vCrowdSlotBrightness; // 0 where the texture stays as painted
        void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        int crowdSlot = int(crowdRegion + 0.5);
        vCrowdColor = crowdSlot == ${Slot.Skin} ? aSkin.rgb
          : crowdSlot == ${Slot.Hair} ? aHair.rgb
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

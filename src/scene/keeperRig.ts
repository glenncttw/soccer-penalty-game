import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';
import type { KeeperPartPose, KeeperPartShape } from '../physics/keeperBody';

/** The keeper's animations, as named in Glenn's Blender file. "L" is the keeper's own left: +x, the shooter's right. */
export type KeeperClip =
  | 'idle'
  | 'ready'
  | 'shuffle_L'
  | 'shuffle_R'
  | 'catch_chest'
  | 'punch'
  | 'tuck_jump'
  | 'dive_low_L'
  | 'dive_low_R'
  | 'dive_high_L'
  | 'dive_high_R'
  | 'celebrate';

/**
 * The solid parts the ball can hit, each fitted around the skin of some bones and moving with
 * one of them. A ball or a capsule, sized to hug the model (a little inside its outermost fluff).
 */
const PARTS: { name: string; bone: string; covers: string[]; capsule: boolean }[] = [
  { name: 'glove_L', bone: 'hand_L', covers: ['hand_L'], capsule: false },
  { name: 'glove_R', bone: 'hand_R', covers: ['hand_R'], capsule: false },
  { name: 'forearm_L', bone: 'forearm_L', covers: ['elbow_mid_L', 'forearm_L'], capsule: true },
  { name: 'forearm_R', bone: 'forearm_R', covers: ['elbow_mid_R', 'forearm_R'], capsule: true },
  { name: 'upperarm_L', bone: 'upperarm_L', covers: ['upperarm_L'], capsule: true },
  { name: 'upperarm_R', bone: 'upperarm_R', covers: ['upperarm_R'], capsule: true },
  { name: 'head', bone: 'head', covers: ['head', 'feathers_L', 'feathers_R'], capsule: false },
  { name: 'beak', bone: 'beak', covers: ['beak'], capsule: true },
  { name: 'chest', bone: 'chest', covers: ['spine', 'chest', 'neck'], capsule: true },
  { name: 'pelvis', bone: 'pelvis', covers: ['pelvis'], capsule: true },
  { name: 'foot_L', bone: 'foot_L', covers: ['shin_L', 'foot_L', 'toe_L'], capsule: true },
  { name: 'foot_R', bone: 'foot_R', covers: ['shin_R', 'foot_R', 'toe_R'], capsule: true },
];
const FIT = 0.85; // share of the skin a part's size takes in: the outermost fluff and feather tips stay soft
const SAMPLE_RATE = 60; // samples a second in each clip's measured track

/** Where both gloves (centre of their solid parts) are at one moment of a clip, the keeper standing at 0. */
export interface ClipSample {
  t: number;
  gloves: [Vec3, Vec3];
}

/** Options for `play`. */
export interface PlayOptions {
  /** Seconds to blend in from what was playing. */
  fade?: number;
  /** 1 = as made in Blender. */
  speed?: number;
  /** Plays once and holds the last pose (dives, saves) instead of looping. */
  once?: boolean;
  /** Seconds into the clip to start from. */
  from?: number;
}

/**
 * Glenn's keeper model with its animations and the solid parts that save shots. `object` is
 * moved to where the keeper stands; `update` plays the animations on and moves the parts with
 * the bones, so the ball is stopped where you see the gloves and body. Also works without a
 * screen (the tests use it), and can snapshot and restore its pose for the replay.
 */
export class KeeperRig {
  /** Moved to the point between the keeper's feet. The model is inside, facing the shooter (+z). */
  readonly object = new THREE.Group();
  readonly shapes: KeeperPartShape[];
  /** Where each part is now, in the order of `shapes`. */
  readonly parts: KeeperPartPose[];
  /** Under the keeper's body for the soft shadow on the grass (see grass.followContacts). */
  readonly shadow = new THREE.Object3D();
  /** Shuffle steps travel this far (m) each second at speed 1; the game moves `object` along with them. */
  readonly shuffleSpeed: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<KeeperClip, THREE.AnimationClip>();
  private readonly actions = new Map<KeeperClip, THREE.AnimationAction>();
  private readonly tracks = new Map<KeeperClip, ClipSample[]>();
  private readonly partBones: THREE.Object3D[];
  private readonly bones: THREE.Bone[];
  private readonly morphed: THREE.Mesh[] = [];
  private readonly pelvis: THREE.Object3D;
  private readonly chest: THREE.Object3D;
  private readonly restPelvisY: number;
  private current: THREE.AnimationAction | null = null;
  private readonly lastTurns: Float32Array;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor(model: THREE.Object3D, animations: THREE.AnimationClip[]) {
    this.object.add(model);
    const skinned: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        skinned.push(o);
        o.frustumCulled = false; // its bounds are the rest pose's; a dive goes well outside them
        if (o.morphTargetInfluences) this.morphed.push(o);
      }
    });
    if (!skinned.length) throw new Error('The keeper model has no skinned mesh');
    this.bones = skinned[0].skeleton.bones;
    const bone = (name: string) => {
      const found = this.bones.find((b) => b.name === name);
      if (!found) throw new Error(`The keeper model has no bone "${name}"`);
      return found;
    };
    this.lastTurns = new Float32Array(this.bones.length * 4);
    this.pelvis = bone('pelvis');
    this.chest = bone('chest');
    this.object.updateMatrixWorld(true);

    // The parts, fitted to the skin around their bones.
    this.shapes = PARTS.map((part) => fitPart(part, skinned, bone(part.bone)));
    this.partBones = PARTS.map((part) => bone(part.bone));
    this.parts = PARTS.map(() => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }));

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) this.clips.set(clip.name as KeeperClip, clip);
    for (const name of ['idle', 'ready', 'shuffle_L', 'shuffle_R'] as KeeperClip[]) this.clip(name);

    // Shuffling walks along the line: the steps play on the spot and the game moves the keeper
    // along at the speed they travel, so the feet don't slide and it can stop anywhere.
    this.shuffleSpeed = this.inPlace('shuffle_L');
    this.inPlace('shuffle_R');

    // Measure where the gloves go in each clip, for the keeper's planning.
    for (const name of this.clips.keys()) this.tracks.set(name, this.measure(name));
    this.mixer.stopAllAction();
    this.play('idle', { fade: 0 });
    this.update(0);
    this.restPelvisY = this.pelvis.getWorldPosition(this.a).y - this.object.position.y;
  }

  /** The gloves through `name`, sampled from start to end with the keeper standing at 0. */
  track(name: KeeperClip): readonly ClipSample[] {
    return this.tracks.get(name)!;
  }

  duration(name: KeeperClip) {
    return this.clip(name).duration;
  }

  /** What's playing now (the one blending in, during a blend). */
  get playing(): KeeperClip | null {
    return (this.current?.getClip().name as KeeperClip) ?? null;
  }

  /** Seconds into what's playing now. */
  get time() {
    return this.current?.time ?? 0;
  }

  /** Blends to `name` (or restarts it when `from` is given). */
  play(name: KeeperClip, { fade = 0.2, speed = 1, once = false, from }: PlayOptions = {}) {
    const action = this.actions.get(name) ?? this.mixer.clipAction(this.clip(name));
    this.actions.set(name, action);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.timeScale = speed;
    if (action === this.current && from === undefined) return;
    const previous = this.current;
    action.reset();
    action.time = from ?? 0;
    action.setEffectiveWeight(1);
    action.play();
    if (previous && previous !== action && fade > 0) {
      action.crossFadeFrom(previous, fade, false);
    } else {
      for (const other of this.actions.values()) if (other !== action) other.stop();
    }
    this.current = action;
  }

  /** Changes how fast what's playing runs. */
  set speed(speed: number) {
    if (this.current) this.current.timeScale = speed;
  }

  /** Plays the animations on by `dt` seconds and moves the solid parts to match. */
  update(dt: number) {
    this.mixer.update(dt);
    this.sync();
  }

  /** Floats in a pose snapshot: where the keeper stands, every bone and the shape keys. */
  get snapshotSize() {
    return 3 + this.bones.length * 10 + this.morphed.length * 2;
  }

  /** Writes the current pose into `out` (see `snapshotSize`). */
  snapshot(out: Float32Array = new Float32Array(this.snapshotSize)) {
    let i = 0;
    const o = this.object.position;
    out[i++] = o.x;
    out[i++] = o.y;
    out[i++] = o.z;
    this.bones.forEach((b, n) => {
      out[i++] = b.position.x;
      out[i++] = b.position.y;
      out[i++] = b.position.z;
      // Each turn the same way round as in the snapshot before (q and -q are the same turn), so
      // blending two snapshots goes the short way.
      const q = b.quaternion;
      const last = this.lastTurns;
      const sign =
        q.x * last[n * 4] + q.y * last[n * 4 + 1] + q.z * last[n * 4 + 2] + q.w * last[n * 4 + 3] < 0 ? -1 : 1;
      last[n * 4] = out[i++] = q.x * sign;
      last[n * 4 + 1] = out[i++] = q.y * sign;
      last[n * 4 + 2] = out[i++] = q.z * sign;
      last[n * 4 + 3] = out[i++] = q.w * sign;
      out[i++] = b.scale.x;
      out[i++] = b.scale.y;
      out[i++] = b.scale.z;
    });
    for (const mesh of this.morphed) {
      out[i++] = mesh.morphTargetInfluences![0] ?? 0;
      out[i++] = mesh.morphTargetInfluences![1] ?? 0;
    }
    return out;
  }

  /**
   * Shows a pose from `snapshot`, or a blend of two (the replay). The animations take over again
   * on the next `update`.
   */
  apply(snapshot: Float32Array) {
    let i = 0;
    this.object.position.set(snapshot[i++], snapshot[i++], snapshot[i++]);
    for (const b of this.bones) {
      b.position.set(snapshot[i++], snapshot[i++], snapshot[i++]);
      b.quaternion.set(snapshot[i++], snapshot[i++], snapshot[i++], snapshot[i++]).normalize(); // blended ones are a little short
      b.scale.set(snapshot[i++], snapshot[i++], snapshot[i++]);
    }
    for (const mesh of this.morphed) {
      mesh.morphTargetInfluences![0] = snapshot[i++];
      mesh.morphTargetInfluences![1] = snapshot[i++];
    }
    this.sync();
  }

  /** Moves the parts (and the shadow) to the bones. */
  private sync() {
    this.object.updateMatrixWorld(true);
    this.partBones.forEach((bone, i) => {
      bone.matrixWorld.decompose(this.p, this.q, this.s);
      const part = this.parts[i];
      part.position.x = this.p.x;
      part.position.y = this.p.y;
      part.position.z = this.p.z;
      part.rotation.x = this.q.x;
      part.rotation.y = this.q.y;
      part.rotation.z = this.q.z;
      part.rotation.w = this.q.w;
    });
    // The shade on the grass sits under the body, leaning with it, fading as it leaves the ground.
    const pelvis = this.pelvis.getWorldPosition(this.a);
    const chest = this.chest.getWorldPosition(this.b);
    this.shadow.position.set(pelvis.x, Math.max(0, pelvis.y - this.object.position.y - this.restPelvisY), pelvis.z);
    this.shadow.position.y += this.object.position.y;
    this.shadow.rotation.z = -Math.atan2(chest.x - pelvis.x, chest.y - pelvis.y);
  }

  private clip(name: KeeperClip) {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`The keeper model has no animation "${name}"`);
    return clip;
  }

  /**
   * Takes the sideways travel out of a stepping clip (its root bone moves along x and jumps back at
   * the loop) and returns how fast it travelled, in metres a second.
   */
  private inPlace(name: KeeperClip) {
    const clip = this.clip(name);
    const track = clip.tracks.find((t) => t.name === 'root.position');
    if (!track) return 0;
    const v = track.values;
    const n = track.times.length;
    // How far the root got by the last key before it jumps back, and when.
    let last = n - 1;
    while (last > 0 && Math.abs(v[last * 3]) < Math.abs(v[(last - 1) * 3]) - 1e-6) last--;
    const travelled = Math.abs(v[last * 3] - v[0]);
    const time = track.times[last] - track.times[0];
    for (let i = 0; i < n; i++) v[i * 3] = v[0];
    // In the model's units; the keeper's bones are scaled by their parents.
    const root = this.bones.find((b) => b.name === 'root')!;
    const scale = root.parent ? root.parent.getWorldScale(this.a).x / this.object.getWorldScale(this.b).x : 1;
    return time > 0 ? (travelled * scale) / time : 0;
  }

  /** Plays `name` from start to end with the keeper at 0 and writes down where the gloves go. */
  private measure(name: KeeperClip): ClipSample[] {
    const keep = this.object.position.clone();
    this.object.position.set(0, 0, 0);
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(this.clip(name));
    action.reset().play();
    const samples: ClipSample[] = [];
    const duration = this.clip(name).duration;
    const steps = Math.ceil(duration * SAMPLE_RATE);
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(duration, i / SAMPLE_RATE);
      action.time = t;
      this.mixer.update(0);
      this.sync();
      samples.push({ t, gloves: [this.partCentre(0), this.partCentre(1)] });
    }
    action.stop();
    this.object.position.copy(keep);
    return samples;
  }

  /** Where the centre of part `i` is now. */
  partCentre(i: number): Vec3 {
    const { position, rotation } = this.parts[i];
    const o = this.shapes[i].offset;
    this.p.set(o.x, o.y, o.z).applyQuaternion(this.q.set(rotation.x, rotation.y, rotation.z, rotation.w));
    return { x: position.x + this.p.x, y: position.y + this.p.y, z: position.z + this.p.z };
  }
}

/**
 * A ball or capsule hugging the skin that moves with `covers`, in `bone`'s frame (metres, without
 * the bone's scale). The capsule runs along the skin's longest direction.
 */
function fitPart(
  part: { name: string; covers: string[]; capsule: boolean },
  meshes: THREE.SkinnedMesh[],
  bone: THREE.Bone,
): KeeperPartShape {
  const points: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  const scale = bone.getWorldScale(new THREE.Vector3()).x;
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    const covers = new Set(part.covers.map((name) => skeleton.bones.findIndex((b) => b.name === name)));
    const boneInverse = skeleton.boneInverses[skeleton.bones.indexOf(bone)];
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.attributes.skinIndex;
    const weight = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < position.count; i++) {
      let best = -1;
      let most = -1;
      for (let k = 0; k < 4; k++) {
        const w = weight.getComponent(i, k);
        if (w > most) [most, best] = [w, index.getComponent(i, k)];
      }
      if (!covers.has(best)) continue;
      // Into the bone's own frame as it was when the skin was bound to it.
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix).applyMatrix4(boneInverse);
      points.push(v.clone().multiplyScalar(scale));
    }
  }
  if (!points.length) throw new Error(`The keeper model has no skin for "${part.name}"`);

  const centre = new THREE.Vector3();
  for (const p of points) centre.add(p);
  centre.divideScalar(points.length);
  if (!part.capsule) {
    const radius = quantile(
      points.map((p) => p.distanceTo(centre)),
      FIT,
    );
    return { name: part.name, radius, halfHeight: 0, offset: toVec(centre), rotation: { x: 0, y: 0, z: 0, w: 1 } };
  }

  const axis = longestDirection(points, centre);
  const along = points.map((p) => v.subVectors(p, centre).dot(axis));
  const across = points.map((p, i) => v.subVectors(p, centre).addScaledVector(axis, -along[i]).length());
  const radius = quantile(across, FIT);
  const lo = quantile(along, 1 - FIT);
  const hi = quantile(along, FIT);
  const halfHeight = Math.max(0.01, (hi - lo) / 2 - radius);
  const middle = centre.clone().addScaledVector(axis, (lo + hi) / 2);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  return {
    name: part.name,
    radius,
    halfHeight,
    offset: toVec(middle),
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
  };
}

/** The direction the points spread out the most (power iteration on their covariance). */
function longestDirection(points: THREE.Vector3[], centre: THREE.Vector3) {
  const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const d = new THREE.Vector3();
  for (const p of points) {
    d.subVectors(p, centre);
    const e = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j] += e[i] * e[j];
  }
  const axis = new THREE.Vector3(1, 1, 1).normalize();
  for (let n = 0; n < 50; n++) {
    axis
      .set(
        c[0] * axis.x + c[1] * axis.y + c[2] * axis.z,
        c[3] * axis.x + c[4] * axis.y + c[5] * axis.z,
        c[6] * axis.x + c[7] * axis.y + c[8] * axis.z,
      )
      .normalize();
  }
  return axis;
}

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}

function toVec(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

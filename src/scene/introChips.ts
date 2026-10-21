import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OVER_PURPLE_LAYER } from './introBackdrop';
import { random } from './random';

/** The chip on the intro (from Glenn, made lighter for the web: 256 px WebP pictures, meshopt). */
export const CHIP_URL = `${import.meta.env.BASE_URL}assets/chips/chip.glb`;

const CHIP_SIZE = 0.1; // metres along a chip's longest side: cartoon big next to the 35 cm ball
const LIFE = 4.5; // seconds from coming out behind the ball to leaving the screen
const TURNS = 1.25; // circles around the ball over that time
const BEHIND = 0.5; // metres behind the ball where a chip comes out
const TOWARD = 0.5; // metres toward the camera it has come when it leaves the screen
const NEAREST = 0.8; // metres in front of the camera a chip never comes closer than (so it never fills the screen)
const REACH = 1.25; // how far out it ends up, in half screens (so past the edge)
const MAX_TILT = 0.95; // radians (about 55 degrees) the circle of each chip is tipped out of the screen
const POP_IN = 0.12; // share of its life a chip takes to grow to full size as it comes out
const BURST_SPEED = 3.5; // Speel nu & Win: how much faster the chips fly off

interface Chip {
  age: number;
  gone: boolean;
  size: number;
  start: number; // angle around the ball where it comes out
  way: number; // 1 or -1: which way round it circles
  tilt: THREE.Quaternion; // how its circle is tipped
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  turn: THREE.Quaternion; // how it starts out turned
}

export type ChipsMode = 'swirl' | 'burst' | 'off';

export async function loadChipModel(): Promise<THREE.Mesh> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(CHIP_URL);
  gltf.scene.updateMatrixWorld(true);
  let chip: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!chip && o instanceof THREE.Mesh) chip = o;
  });
  return chip!;
}

/**
 * Chips swirling out from behind the ball on the intro: each one comes out small from the middle,
 * circles round the ball in its own tipped circle toward the camera, tumbling, and leaves the screen,
 * then comes round again. On Speel nu & Win they all fly off fast. One instanced draw, drawn over the
 * purple together with the ball (see introBackdrop.ts), and worked out as seen from the camera so they
 * stay with the ball while the camera moves.
 */
export class IntroChips {
  readonly mesh: THREE.InstancedMesh;
  private readonly chips: Chip[] = [];
  private readonly random = random(7);
  private readonly anchor = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly spin = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();

  constructor(model: THREE.Mesh, count: number) {
    // One chip, centred and as long as 1 (the instances give it its size).
    const geometry = toFloat(model.geometry).applyMatrix4(model.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    geometry.translate(...box.getCenter(new THREE.Vector3()).negate().toArray());
    geometry.scale(...new THREE.Vector3(1, 1, 1).divideScalar(Math.max(size.x, size.y, size.z)).toArray());
    this.mesh = new THREE.InstancedMesh(geometry, model.material, count);
    this.mesh.layers.set(OVER_PURPLE_LAYER); // only drawn over the purple, never in the stadium pass
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    for (let i = 0; i < count; i++) {
      const chip = {} as Chip;
      this.respawn(chip);
      chip.age = (i / count) * LIFE; // the swirl is already full when the intro shows
      this.chips.push(chip);
    }
  }

  /**
   * Call every frame after the ball has been placed (and the camera moved). 'swirl' while the intro
   * waits, 'burst' as the ball flies down, 'off' otherwise.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, ball: THREE.Object3D, mode: ChipsMode) {
    if (mode === 'off') {
      if (this.mesh.visible) for (const chip of this.chips) chip.gone = false; // all back for next time
      this.mesh.visible = false;
      return;
    }
    camera.updateMatrixWorld();
    // Circling round where the ball floats; on the way down they stay round that spot on screen.
    if (mode === 'swirl' || !this.mesh.visible) this.anchor.copy(ball.position).applyMatrix4(camera.matrixWorldInverse);
    this.mesh.visible = true;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfSide = halfHeight * Math.max(1, camera.aspect);
    const speed = mode === 'burst' ? BURST_SPEED : 1;

    this.chips.forEach((chip, i) => {
      chip.age += dt * speed;
      if (chip.age >= LIFE) {
        if (mode === 'burst') chip.gone = true;
        else {
          this.respawn(chip);
          chip.gone = false;
        }
      }
      const u = Math.min(1, chip.age / LIFE);
      const depth = Math.min(-NEAREST, this.anchor.z - BEHIND + (BEHIND + TOWARD) * u);
      const radius = REACH * halfSide * -depth * u ** 1.3;
      const angle = chip.start + chip.way * TURNS * 2 * Math.PI * u;
      this.p.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(chip.tilt);
      this.p.x += this.anchor.x;
      this.p.y += this.anchor.y;
      this.p.z = Math.min(-NEAREST, this.p.z + depth);
      this.p.applyMatrix4(camera.matrixWorld);

      this.spin.setFromAxisAngle(chip.spinAxis, chip.spinSpeed * chip.age);
      this.q.copy(camera.quaternion).multiply(this.spin).multiply(chip.turn);
      const pop = chip.gone ? 0 : smoothstep(0, POP_IN, u);
      this.s.setScalar(chip.size * pop);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private respawn(chip: Chip) {
    const r = this.random;
    chip.age = 0;
    chip.gone = false;
    chip.size = CHIP_SIZE * (0.8 + 0.4 * r());
    chip.start = r() * 2 * Math.PI;
    chip.way = r() < 0.5 ? 1 : -1;
    const tiltAxis = new THREE.Vector3(Math.cos(r() * 2 * Math.PI), Math.sin(r() * 2 * Math.PI), 0).normalize();
    chip.tilt = new THREE.Quaternion().setFromAxisAngle(tiltAxis, (r() * 2 - 1) * MAX_TILT);
    chip.spinAxis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    chip.spinSpeed = 2 + 3 * r();
    chip.turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6.28, r() * 6.28, r() * 6.28));
  }
}

/**
 * A copy with plain numbers in every attribute: the web version stores them packed into small whole numbers
 * (meshopt), which can't be moved and scaled in place.
 */
function toFloat(source: THREE.BufferGeometry) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.index ? Array.from(source.index.array) : null);
  for (const [name, attr] of Object.entries(source.attributes)) {
    if (name === 'tangent' || name === 'uv1') continue; // not needed: the normal map works without them
    const values = new Float32Array(attr.count * attr.itemSize);
    const get = [attr.getX, attr.getY, attr.getZ, attr.getW].map((f) => f.bind(attr));
    for (let i = 0; i < attr.count; i++) {
      for (let c = 0; c < attr.itemSize; c++) values[i * attr.itemSize + c] = get[c](i);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
  }
  return geometry;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

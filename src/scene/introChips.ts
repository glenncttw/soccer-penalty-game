import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OVER_PURPLE_LAYER } from './introBackdrop';
import { random } from './random';

/** The chip on the intro (from Glenn, made lighter for the web: 256 px WebP pictures, meshopt). */
export const CHIP_URL = `${import.meta.env.BASE_URL}assets/chips/chip.glb`;

// Sizes and distances are shares of how far the floating ball is from the camera, so the chips look
// the same next to the ball on every screen (the ball is closer on an upright phone).
const CHIP_SIZE = 0.1; // along a chip's longest side: about half the ball across as it passes the ball
const LIFE = 9; // seconds from coming out far behind the ball to leaving the screen
const TURNS = 1.2; // turns of the tunnel over that time
const FAR = 4; // how far away a chip comes out (deep behind the ball, hidden by it)
const NEAR = 0.35; // how close it has come when it leaves the screen
const REACH = 1.25; // how far out it is by then, in halves of the screen's diagonal (so past the corners)
const SPREAD = 0.2; // how much wider or narrower than that each chip's circle is
const POP_IN = 0.1; // share of its life a chip takes to grow to full size as it comes out
const BURST_TIME = 1; // Speel nu & Win: seconds the chips take to rush out and shrink away
const BURST_SPEED = 5; // how much faster they come down the tunnel then

interface Chip {
  age: number;
  size: number;
  start: number; // angle around the ball where it comes out
  wide: number; // how wide its circle is, as a share of REACH
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
 * A tunnel of chips on the intro: each one comes out small, deep behind the ball, and comes down the
 * tunnel toward the camera, circling round the ball and rolling, until it leaves the screen past the
 * edge; then it starts again at the back. On Speel nu & Win they rush out and shrink away. One instanced
 * draw, drawn over the purple together with the ball (see introBackdrop.ts), and worked out as seen from
 * the camera so they stay with the ball while the camera moves.
 */
export class IntroChips {
  readonly mesh: THREE.InstancedMesh;
  private readonly chips: Chip[] = [];
  private readonly random = random(7);
  private readonly anchor = new THREE.Vector3();
  private burst = 0; // seconds since Speel nu & Win
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
   * Call every frame after the ball has been placed (and the camera moved). 'swirl' (the tunnel) while the intro
   * waits, 'burst' as the ball flies down, 'off' otherwise.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, ball: THREE.Object3D, mode: ChipsMode) {
    if (mode === 'off') {
      this.mesh.visible = false;
      this.burst = 0; // all back for next time
      return;
    }
    camera.updateMatrixWorld();
    // Circling round where the ball floats; on the way down they stay round that spot on screen.
    if (mode === 'swirl' || !this.mesh.visible) this.anchor.copy(ball.position).applyMatrix4(camera.matrixWorldInverse);
    this.mesh.visible = true;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfDiagonal = halfHeight * Math.hypot(1, camera.aspect);
    const away = -this.anchor.z; // the ball's distance
    this.burst = mode === 'burst' ? this.burst + dt : 0;
    const out = smoothstep(0, BURST_TIME, this.burst); // 0 while swirling, 1 once they've all rushed off

    this.chips.forEach((chip, i) => {
      chip.age += dt * (1 + BURST_SPEED * out);
      if (chip.age >= LIFE) this.respawn(chip);
      const u = chip.age / LIFE;
      // Down the tunnel at a steady speed, so a chip seems to speed up and grow as it comes close.
      const depth = away * (FAR + (NEAR - FAR) * u);
      // The tunnel's wall: the same width all the way, so seen from the camera the circles open up.
      const radius = REACH * chip.wide * halfDiagonal * NEAR * away;
      const angle = chip.start + TURNS * 2 * Math.PI * u;
      this.p.set(this.anchor.x + Math.cos(angle) * radius, this.anchor.y + Math.sin(angle) * radius, -depth);
      this.p.applyMatrix4(camera.matrixWorld);

      this.spin.setFromAxisAngle(chip.spinAxis, chip.spinSpeed * chip.age);
      this.q.copy(camera.quaternion).multiply(this.spin).multiply(chip.turn);
      const pop = smoothstep(0, POP_IN, u) * (1 - out);
      this.s.setScalar(chip.size * away * pop);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private respawn(chip: Chip) {
    const r = this.random;
    chip.age = 0;
    chip.size = CHIP_SIZE * (0.8 + 0.4 * r());
    chip.start = r() * 2 * Math.PI;
    chip.wide = 1 + (r() * 2 - 1) * SPREAD;
    chip.spinAxis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    chip.spinSpeed = 0.5 + r(); // radians a second: a lazy roll
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

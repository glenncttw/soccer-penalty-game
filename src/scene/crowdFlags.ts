import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from './crowd';
import { CROWD_FLAG_SETTINGS, type CrowdFlagSettings } from './crowdFlagSettings';
import {
  TriangleIndex,
  rectsOverlap,
  shapeOf,
  type CrowdSpot,
  type Moves,
  type PersonBox,
  type Rect,
  type Triangles,
} from './crowdSpots';

const POLE_RADIUS = 0.018;
/** How far below where it's held the pole goes on, hidden behind the person holding it. */
const POLE_BELOW_HOLD = 0.05;
/** How far behind the person holding it the pole may stand: the nearest that has room. */
const BEHIND = { nearest: 0.3, furthest: 0.75, step: 0.03 };
/** The room a flag takes is measured in layers this high. */
const SLICE = 0.1;
/** Space kept free between a flag and anything else, on top of the people's own room. */
const MARGIN = 0.03;
/** 0..1: how much the cloth's sag changes as it ripples, either way (the same as the shader). */
const SAG_FLUTTER = 0.3;
/** How much stronger the ripples' shading is than their shape, so the cloth's folds show from afar. */
const FOLD_SHADING = 2.5;
/** How many swing positions the flag's room is measured at, from one side to the other. */
const SWEEP_STEPS = 9;

/** Where a flag stands, and whose it is. */
export interface FlagSpot {
  /** The bottom of the pole, on the step's floor. */
  x: number;
  y: number;
  z: number;
  /** Turn about the up axis, in radians: the cloth goes out along the flag's own +x, turned by this (as the crowd's angles). */
  angle: number;
  /** The person holding it, as an index into the crowd's spots. */
  holder: number;
}

interface PlacedBox {
  rect: Rect;
  lo: number;
  hi: number;
}

/**
 * The room a flag takes up while it waves, in its own space (the pole at x = z = 0 standing on
 * the floor at y = 0, the cloth going out along +x): a box for each layer of the space it sweeps
 * through, at every swing and with its ripples at their furthest either way.
 */
export function flagShape(s: CrowdFlagSettings): PersonBox[] {
  const triangles: number[] = [];
  const bottom = s.holdHeight - POLE_BELOW_HOLD;
  const quad = (a: number[], b: number[], c: number[], d: number[]) =>
    triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let k = 0; k < SWEEP_STEPS; k++) {
    const tilt = THREE.MathUtils.degToRad(s.swing) * ((2 * k) / (SWEEP_STEPS - 1) - 1);
    const c = Math.cos(tilt);
    const sn = Math.sin(tilt);
    const at = (x: number, y: number, z: number) => [
      x * c - (y - s.holdHeight) * sn,
      s.holdHeight + x * sn + (y - s.holdHeight) * c,
      z,
    ];
    const r = POLE_RADIUS;
    quad(at(-r, bottom, 0), at(r, bottom, 0), at(r, s.poleHeight, 0), at(-r, s.poleHeight, 0));
    quad(at(0, bottom, -r), at(0, bottom, r), at(0, s.poleHeight, r), at(0, s.poleHeight, -r));
    const strips = 8;
    for (const side of [-1, 1]) {
      for (const sag of [1 - SAG_FLUTTER, 1 + SAG_FLUTTER]) {
        for (let i = 0; i < strips; i++) {
          const u0 = i / strips;
          const u1 = (i + 1) / strips;
          const z0 = side * s.ripple * ripplesReach(u0);
          const z1 = side * s.ripple * ripplesReach(u1);
          const x0 = u0 * s.width;
          const x1 = u1 * s.width;
          const top0 = s.poleHeight - sag * s.sag * u0 * u0;
          const top1 = s.poleHeight - sag * s.sag * u1 * u1;
          quad(at(x0, top0 - s.height, z0), at(x1, top1 - s.height, z1), at(x1, top1, z1), at(x0, top0, z0));
        }
      }
    }
  }
  return shapeOf(new Float32Array(triangles), SLICE);
}

/** 0..1: how far the cloth ripples at this far out from the pole (0 = at the pole, 1 = its free end); the same as the shader. */
function ripplesReach(u: number): number {
  return Math.pow(u, 1.3);
}

/**
 * Picks who holds each flag: the person nearest to each place in `s.places` with room behind them
 * for the pole (as near behind them as there's room: often just behind the next step's barrier), and round it for the cloth to wave in, without touching the stadium, anyone
 * in the crowd (in any of their moves) or another flag. The cloth goes out to one side or the
 * other, whichever has room (the flags take turns which side they try first). Places with no room
 * near them get no flag.
 */
export function placeFlags(
  spots: CrowdSpot[],
  room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]> },
  s: CrowdFlagSettings,
): FlagSpot[] {
  const shape = flagShape(s);
  const stadium = new TriangleIndex(room.stadium);
  const reach =
    Math.max(
      ...shape.map((b) =>
        Math.max(Math.hypot(b.x0, b.z0), Math.hypot(b.x1, b.z0), Math.hypot(b.x0, b.z1), Math.hypot(b.x1, b.z1)),
      ),
    ) + 1;
  const peopleBoxes = spots.map((p) =>
    room.shapes[p.moves].map((b) => ({
      rect: {
        x: p.x,
        z: p.z,
        angle: p.angle,
        x0: b.x0 * p.size,
        x1: b.x1 * p.size,
        z0: b.z0 * p.size,
        z1: b.z1 * p.size,
      },
      lo: p.y + b.y0 * p.size,
      hi: p.y + b.y1 * p.size,
    })),
  );
  const touch = (a: PlacedBox[], b: PlacedBox[]) =>
    a.some((p) => b.some((q) => p.lo < q.hi && q.lo < p.hi && rectsOverlap(p.rect, q.rect)));

  // Each row's people in order round the stands: from the left side near the camera, round behind the goal, to the right side.
  const middleZ = spots.reduce((sum, p) => sum + p.z, 0) / Math.max(spots.length, 1);
  const rows = new Map<number, number[]>();
  spots.forEach((p, i) => rows.set(p.row, [...(rows.get(p.row) ?? []), i]));
  for (const row of rows.values()) {
    row.sort((a, b) => Math.atan2(spots[a].x, middleZ - spots[a].z) - Math.atan2(spots[b].x, middleZ - spots[b].z));
  }

  const flags: FlagSpot[] = [];
  const placed: PlacedBox[][] = [];
  s.places.forEach((place, n) => {
    const row = rows.get(place.row);
    if (!row) return;
    const target = Math.round(THREE.MathUtils.clamp(place.along, 0, 1) * (row.length - 1));
    const order = row.map((_, k) => k).sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    for (const k of order) {
      const p = spots[row[k]];
      const front = facing(spots, row, k);
      const ahead = Math.atan2(front.x, front.z);
      for (let behind = BEHIND.nearest; behind <= BEHIND.furthest; behind += BEHIND.step) {
        const x = p.x - front.x * behind;
        const z = p.z - front.z * behind;
        for (const angle of n % 2 === 0 ? [ahead, ahead + Math.PI] : [ahead + Math.PI, ahead]) {
          const boxes = shape.map((b) => ({
            rect: { x, z, angle, x0: b.x0 - MARGIN, x1: b.x1 + MARGIN, z0: b.z0 - MARGIN, z1: b.z1 + MARGIN },
            lo: p.y + b.y0 - MARGIN,
            hi: p.y + b.y1 + MARGIN,
          }));
          if (boxes.some((b) => stadium.touches(b.rect, b.lo, b.hi))) continue;
          const near = spots.some((q, i) => Math.hypot(q.x - x, q.z - z) < reach && touch(peopleBoxes[i], boxes));
          if (near || placed.some((f) => touch(f, boxes))) continue;
          placed.push(boxes);
          flags.push({ x, y: p.y, z, angle, holder: row[k] });
          return;
        }
      }
    }
  });
  return flags;
}

/** Which way the row faces at its k-th person: across the row, toward the pitch. */
function facing(spots: CrowdSpot[], row: number[], k: number): { x: number; z: number } {
  const p = spots[row[k]];
  const own = { x: Math.sin(p.angle), z: Math.cos(p.angle) };
  const nearby = (j: number) => {
    const q = spots[row[j]];
    return q && Math.hypot(q.x - p.x, q.z - p.z) < 1.5 ? q : p;
  };
  const a = nearby(k - 1);
  const b = nearby(k + 1);
  const along = { x: b.x - a.x, z: b.z - a.z };
  const length = Math.hypot(along.x, along.z);
  if (length < 1e-6) return own;
  const across = { x: -along.z / length, z: along.x / length };
  return across.x * own.x + across.z * own.z >= 0 ? across : { x: -across.x, z: -across.z };
}

/**
 * Big flags waving in the crowd (see crowdFlagSettings.ts): each held by someone in the stands
 * (see placeFlags), swinging side to side with ripples running along its cloth. The waving is
 * worked out on the graphics card, and all the flags are drawn in one go.
 */
export class CrowdFlags {
  readonly mesh: THREE.InstancedMesh;
  readonly flags: FlagSpot[];
  private readonly uniforms = {
    uFlagTime: { value: 0 },
    uSwing: { value: 0 },
    uSwingSpeed: { value: 0 },
    uRipple: { value: 0 },
    uSag: { value: 0 },
    uRippleSpeed: { value: 0 },
    uWidth: { value: 1 },
    uHold: { value: 0 },
    uPoleColor: { value: new THREE.Color() },
  };

  constructor(
    crowd: { spots: CrowdSpot[]; room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]> } },
    envMap: THREE.Texture | null,
    s: CrowdFlagSettings = CROWD_FLAG_SETTINGS,
  ) {
    this.flags = s.flags ? placeFlags(crowd.spots, crowd.room, s) : [];
    const u = this.uniforms;
    u.uSwing.value = THREE.MathUtils.degToRad(s.swing);
    u.uSwingSpeed.value = s.swingSpeed;
    u.uRipple.value = s.ripple;
    u.uSag.value = s.sag;
    u.uRippleSpeed.value = s.rippleSpeed;
    u.uWidth.value = s.width;
    u.uHold.value = s.holdHeight;
    u.uPoleColor.value.set(s.poleColor);

    const bottom = s.holdHeight - POLE_BELOW_HOLD;
    const pole = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, s.poleHeight - bottom, 8, 1);
    pole.translate(0, (s.poleHeight + bottom) / 2, 0);
    const cloth = new THREE.PlaneGeometry(s.width, s.height, 24, 12);
    cloth.translate(s.width / 2, s.poleHeight - s.height / 2, 0);
    for (const [g, isCloth] of [
      [pole, 0],
      [cloth, 1],
    ] as const) {
      g.setAttribute(
        'aCloth',
        new THREE.Float32BufferAttribute(new Array<number>(g.getAttribute('position').count).fill(isCloth), 1),
      );
    }
    const geometry = mergeGeometries([pole, cloth]);
    if (!geometry) throw new Error('Crowd flags: the pole and cloth could not be put together');
    const random = seeded(s.seed);
    const timing = new Float32Array(this.flags.length * 2);
    this.flags.forEach((_, i) => timing.set([random(), 0.85 + 0.3 * random()], i * 2));
    geometry.setAttribute('aFlag', new THREE.InstancedBufferAttribute(timing, 2));

    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    if (envMap) material.envMap = envMap;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE}`)
        .replace('#include <beginnormal_vertex>', 'wave(position, normal);\nvec3 objectNormal = flagNormal;')
        .replace('#include <begin_vertex>', 'vec3 transformed = flagPosition;\nvCloth = aCloth;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uPoleColor;\nvarying float vCloth;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb = mix(uPoleColor, diffuseColor.rgb, step(0.5, vCloth));',
        );
    };
    material.customProgramCacheKey = () => 'crowd-flags';

    this.mesh = new THREE.InstancedMesh(geometry, material, this.flags.length);
    this.mesh.name = 'CrowdFlags';
    this.mesh.frustumCulled = false; // the waving moves them about in the shader
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    this.flags.forEach((f, i) => {
      matrix.compose(new THREE.Vector3(f.x, f.y, f.z), turn.setFromAxisAngle(up, f.angle), new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, color.set(s.colors[i % s.colors.length] ?? '#ffffff'));
    });
    this.mesh.visible = this.flags.length > 0;
  }

  /** Moves the flags along to the game's time (so slow motion slows them too). */
  update(time: number) {
    this.uniforms.uFlagTime.value = time;
  }
}

// The flag's pose at this moment, in its own space: ripples running out along the cloth (none at
// the pole, the most at its free end, within `ripple` either way, as flagShape allows for), its
// free end sagging a little, then
// the whole flag swung to the side about where it's held.
const WAVE = /* glsl */ `
  attribute float aCloth; // 1 on the cloth, 0 on the pole
  attribute vec2 aFlag; // this flag's start in its waving (0..1) and its speed
  uniform float uFlagTime, uSwing, uSwingSpeed, uRipple, uRippleSpeed, uSag, uWidth, uHold;
  varying float vCloth;
  vec3 flagPosition;
  vec3 flagNormal;
  void wave(vec3 p, vec3 n) {
    float t = uFlagTime * aFlag.y;
    float start = aFlag.x * 6.2832;
    float u = aCloth * clamp(p.x / uWidth, 0.0, 1.0);
    float reach = pow(u, 1.3);
    float a = 10.0 * u - 6.2832 * uRippleSpeed * t + start;
    float b = 3.0 * u + 4.0 * p.y - 6.2832 * uRippleSpeed * 1.37 * t + 2.1 * start;
    float w = 0.7 * sin(a) + 0.3 * sin(b);
    vec3 q = p + vec3(0.0, -uSag * u * u * (1.0 + ${SAG_FLUTTER.toFixed(2)} * sin(a)), uRipple * reach * w);
    float reachSlope = u > 0.0 ? 1.3 * pow(u, 0.3) / uWidth : 0.0;
    float slopeX = uRipple * (reachSlope * w + reach * (7.0 * cos(a) + 0.9 * cos(b)) / uWidth);
    float slopeY = uRipple * reach * 1.2 * cos(b);
    vec3 m = aCloth > 0.5 ? normalize(vec3(vec2(-slopeX, -slopeY) * ${FOLD_SHADING.toFixed(1)}, 1.0)) : n;
    float tilt = uSwing * sin(6.2832 * uSwingSpeed * t + start);
    float c = cos(tilt);
    float s = sin(tilt);
    q.y -= uHold;
    flagPosition = vec3(c * q.x - s * q.y, uHold + s * q.x + c * q.y, q.z);
    flagNormal = vec3(c * m.x - s * m.y, s * m.x + c * m.y, m.z);
  }
`;

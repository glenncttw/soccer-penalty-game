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
/** Above this over the holder's step, the stadium between them and their pole is a barrier or a step up (not the floor). */
const ABOVE_FEET = 0.3;
/** A pole behind a barrier needs someone on the step behind it standing this near it (metres), to hide its bottom. */
const HIDDEN_BY = 0.75;
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
  /** This flag's own waving (see `FlagMotion`). */
  motion: FlagMotion;
}

/** How one flag waves, so they don't all move alike. */
export interface FlagMotion {
  /** How much higher than `holdHeight` it's held, in metres (the pole is longer by as much: its bottom stays hidden). */
  raise: number;
  /** How far it swings to each side, in degrees. */
  swing: number;
  /** How far it's lifted and let down again as it's waved, in metres. */
  lift: number;
}

/** Each place's flag's own waving, drawn from `random`: within the settings' `swing`, `lift` and `raise`. */
export function flagMotions(s: CrowdFlagSettings, random: () => number): FlagMotion[] {
  return s.places.map(() => ({
    raise: s.raise * random(),
    swing: s.swing * (1 - s.variety * random()),
    lift: s.lift * (1 - s.variety * random()),
  }));
}

interface PlacedBox {
  rect: Rect;
  lo: number;
  hi: number;
}

/**
 * The room a flag takes up while it waves, in its own space (the pole at x = z = 0 standing on
 * the floor at y = 0, the cloth going out along +x): a box for each layer of the space it sweeps
 * through, at every swing and lift, and with its ripples at their furthest either way.
 */
export function flagShape(
  s: CrowdFlagSettings,
  m: FlagMotion = { raise: 0, swing: s.swing, lift: s.lift },
): PersonBox[] {
  const triangles: number[] = [];
  const bottom = s.holdHeight - POLE_BELOW_HOLD;
  const quad = (a: number[], b: number[], c: number[], d: number[]) =>
    triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const lift of [0, m.lift / 2, m.lift]) {
    // Everything but the pole's bottom goes up with the flag (as in the shader), and it swings about where it's held.
    const up = m.raise + lift;
    const hold = s.holdHeight + up;
    for (let k = 0; k < SWEEP_STEPS; k++) {
      const tilt = THREE.MathUtils.degToRad(m.swing) * ((2 * k) / (SWEEP_STEPS - 1) - 1);
      const c = Math.cos(tilt);
      const sn = Math.sin(tilt);
      const at = (x: number, y: number, z: number) => [x * c - (y - hold) * sn, hold + x * sn + (y - hold) * c, z];
      const r = POLE_RADIUS;
      const top = s.poleHeight + up;
      quad(at(-r, bottom, 0), at(r, bottom, 0), at(r, top, 0), at(-r, top, 0));
      quad(at(0, bottom, -r), at(0, bottom, r), at(0, top, r), at(0, top, -r));
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
            const top0 = top - sag * s.sag * u0 * u0;
            const top1 = top - sag * s.sag * u1 * u1;
            quad(at(x0, top0 - s.height, z0), at(x1, top1 - s.height, z1), at(x1, top1, z1), at(x0, top0, z0));
          }
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
 * for the pole (as near behind them as there's room: often just behind the next step's barrier),
 * and round it for the cloth to wave in, without touching the stadium, anyone in the crowd (in any
 * of their moves) or another flag. The cloth goes out along the row to one side or the other,
 * whichever has room (the flags take turns which side they try first), turned a little by its own
 * random amount (up to the settings' `turn`). Places with no room near
 * them get no flag.
 */
export function placeFlags(
  spots: CrowdSpot[],
  room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] },
  s: CrowdFlagSettings,
  random: () => number = seeded(s.seed),
): FlagSpot[] {
  const motions = flagMotions(s, random);
  const turns = s.places.map(() => THREE.MathUtils.degToRad(s.turn) * (random() * 2 - 1));
  const stadium = new TriangleIndex(room.stadium);
  const peopleBoxes = spots.map((p) =>
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

  // Whether a pole this far behind its holder would stand bare behind a barrier: something of the stadium between
  // them (below where it's held) and nobody standing round the pole on the step behind to hide it.
  const bare = (p: CrowdSpot, front: { x: number; z: number }, behind: number, x: number, z: number) => {
    const between: Rect = {
      x: p.x - (front.x * behind) / 2,
      z: p.z - (front.z * behind) / 2,
      angle: Math.atan2(front.x, front.z),
      x0: -POLE_RADIUS,
      x1: POLE_RADIUS,
      z0: -behind / 2,
      z1: behind / 2,
    };
    if (!stadium.touches(between, p.y + ABOVE_FEET, p.y + s.holdHeight)) return false;
    return !spots.some((q) => q.y > p.y + ABOVE_FEET && Math.hypot(q.x - x, q.z - z) < HIDDEN_BY);
  };

  const flags: FlagSpot[] = [];
  const placed: PlacedBox[][] = [];
  s.places.forEach((place, n) => {
    const row = rows.get(place.row);
    if (!row) return;
    const shape = flagShape(s, motions[n]);
    const reach = Math.max(...shape.map((b) => Math.hypot(Math.max(-b.x0, b.x1), Math.max(-b.z0, b.z1)))) + 1;
    const target = Math.round(THREE.MathUtils.clamp(place.along, 0, 1) * (row.length - 1));
    const order = row.map((_, k) => k).sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    for (const k of order) {
      const p = spots[row[k]];
      const front = facing(spots, row, k);
      const ahead = Math.atan2(front.x, front.z) + turns[n];
      for (let behind = BEHIND.nearest; behind <= BEHIND.furthest; behind += BEHIND.step) {
        const x = p.x - front.x * behind;
        const z = p.z - front.z * behind;
        if (bare(p, front, behind, x, z)) continue;
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
          flags.push({ x, y: p.y, z, angle, holder: row[k], motion: motions[n] });
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

export const FLAG_LOGO_URL = `${import.meta.env.BASE_URL}assets/crowd/flag_logo.svg`;
/** How wide the logo's picture is drawn from its SVG, in pixels, with a clear border so its edge stays clean far away. */
const LOGO_PIXELS = 1024;
const LOGO_BORDER = 16;

/** The flags' logo, drawn from its SVG into a texture once, and its picture's width over its height. */
export interface FlagLogo {
  texture: THREE.Texture;
  aspect: number;
}

/** Loads the logo for the flags (`public/assets/crowd/flag_logo.svg`; its `width` and `height` give its shape). */
export async function loadFlagLogo(renderer: THREE.WebGLRenderer, url = FLAG_LOGO_URL): Promise<FlagLogo> {
  const image = await new THREE.ImageLoader().loadAsync(url);
  if (!image.width || !image.height) throw new Error(`Flag logo ${url} needs a width and height`);
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_PIXELS;
  canvas.height = Math.round(((LOGO_PIXELS - 2 * LOGO_BORDER) * image.height) / image.width) + 2 * LOGO_BORDER;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Flag logo: no 2D canvas to draw it on');
  context.drawImage(image, LOGO_BORDER, LOGO_BORDER, canvas.width - 2 * LOGO_BORDER, canvas.height - 2 * LOGO_BORDER);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Its edge blends into the cloth evenly when blurred (no dark rim) with its colours already weighed by how see-through it is.
  texture.premultiplyAlpha = true;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { texture, aspect: canvas.width / canvas.height };
}

/**
 * Big flags waving in the crowd (see crowdFlagSettings.ts): each held by someone in the stands
 * (see placeFlags), each swinging side to side and lifted up and down in its own way, with ripples running
 * along its cloth, and the logo on it. The waving is worked out on the graphics card, and all the
 * flags are drawn in one go.
 */
export class CrowdFlags {
  readonly mesh: THREE.InstancedMesh;
  readonly flags: FlagSpot[];
  private readonly uniforms = {
    uFlagTime: { value: 0 },
    uSwingSpeed: { value: 0 },
    uLiftSpeed: { value: 0 },
    uRipple: { value: 0 },
    uSag: { value: 0 },
    uRippleSpeed: { value: 0 },
    uWidth: { value: 1 },
    uHold: { value: 0 },
    uPoleColor: { value: new THREE.Color() },
    uLogo: { value: null as THREE.Texture | null },
    uLogoRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  };

  constructor(
    crowd: { spots: CrowdSpot[]; room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] } },
    envMap: THREE.Texture | null,
    logo: FlagLogo | null,
    s: CrowdFlagSettings = CROWD_FLAG_SETTINGS,
  ) {
    const random = seeded(s.seed);
    this.flags = s.flags ? placeFlags(crowd.spots, crowd.room, s, random) : [];
    const u = this.uniforms;
    u.uSwingSpeed.value = s.swingSpeed;
    u.uLiftSpeed.value = s.liftSpeed;
    u.uRipple.value = s.ripple;
    u.uSag.value = s.sag;
    u.uRippleSpeed.value = s.rippleSpeed;
    u.uWidth.value = s.width;
    u.uHold.value = s.holdHeight;
    u.uPoleColor.value.set(s.poleColor);
    if (logo && s.logoSize > 0) {
      // The logo in the middle of the cloth, `logoSize` of its height (or less, to fit its width), in the cloth's UVs.
      const height = Math.min(s.logoSize, (s.logoSize * s.width) / (s.height * logo.aspect));
      const width = (height * s.height * logo.aspect) / s.width;
      u.uLogo.value = logo.texture;
      u.uLogoRect.value.set(0.5 - width / 2, 0.5 - height / 2, width, height);
    }

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
    // Each flag's start in its waving, its speed, how far it swings (radians), and how high it's raised and lifted.
    const own = new Float32Array(this.flags.length * 4);
    const raised = new Float32Array(this.flags.length * 2);
    this.flags.forEach((f, i) => {
      own.set([random(), 1 - s.speedVariety + 2 * s.speedVariety * random()], i * 4);
      own.set([THREE.MathUtils.degToRad(f.motion.swing), f.motion.lift], i * 4 + 2);
      raised.set([f.motion.raise, random()], i * 2);
    });
    geometry.setAttribute('aFlag', new THREE.InstancedBufferAttribute(own, 4));
    geometry.setAttribute('aRaise', new THREE.InstancedBufferAttribute(raised, 2));

    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    if (envMap) material.envMap = envMap;
    const hasLogo = u.uLogo.value !== null;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE}`)
        .replace('#include <beginnormal_vertex>', 'wave(position, normal);\nvec3 objectNormal = flagNormal;')
        .replace('#include <begin_vertex>', 'vec3 transformed = flagPosition;\nvCloth = aCloth;\nvFlagUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uPoleColor;
          uniform sampler2D uLogo;
          uniform vec4 uLogoRect;
          varying float vCloth;
          varying vec2 vFlagUv;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb = mix(uPoleColor, diffuseColor.rgb, step(0.5, vCloth));
          ${hasLogo ? LOGO : ''}`,
        );
    };
    material.customProgramCacheKey = () => `crowd-flags${hasLogo ? '-logo' : ''}`;

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

// The logo on the cloth, reading the right way round from both sides (seen from its back, the
// cloth's UVs run the other way), laid over the cloth's colour (the logo's colours are already
// weighed by how see-through it is).
const LOGO = /* glsl */ `
  vec2 onCloth = vec2(gl_FrontFacing ? vFlagUv.x : 1.0 - vFlagUv.x, vFlagUv.y);
  vec2 inLogo = (onCloth - uLogoRect.xy) / uLogoRect.zw;
  // Read everywhere (the picture's border is clear), so its blurring far away stays smooth at the logo's edge.
  vec4 logo = texture2D(uLogo, clamp(inLogo, 0.0, 1.0));
  vec2 inside = step(vec2(0.0), inLogo) * step(inLogo, vec2(1.0));
  logo *= inside.x * inside.y * step(0.5, vCloth);
  diffuseColor.rgb = logo.rgb + diffuseColor.rgb * (1.0 - logo.a);
`;

// The flag's pose at this moment, in its own space: ripples running out along the cloth (none at
// the pole, the most at its free end, within `ripple` either way, as flagShape allows for), its
// free end sagging a little, everything but the pole's hidden bottom raised and lifted (so the
// pole gets longer instead of its bottom showing), then the whole flag swung to the side about
// where it's held.
const WAVE = /* glsl */ `
  attribute float aCloth; // 1 on the cloth, 0 on the pole
  attribute vec4 aFlag; // this flag's start in its waving (0..1), its speed, how far it swings (radians) and is lifted (m)
  attribute vec2 aRaise; // how much higher it's held (m), and its lifting's start (0..1)
  uniform float uFlagTime, uSwingSpeed, uLiftSpeed, uRipple, uRippleSpeed, uSag, uWidth, uHold;
  varying float vCloth;
  varying vec2 vFlagUv;
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
    float up = aRaise.x + aFlag.w * (0.5 - 0.5 * cos(6.2832 * (uLiftSpeed * t + aRaise.y)));
    float hold = uHold + up;
    if (aCloth > 0.5 || p.y > uHold) q.y += up;
    float tilt = aFlag.z * sin(6.2832 * uSwingSpeed * t + start);
    float c = cos(tilt);
    float s = sin(tilt);
    q.y -= hold;
    flagPosition = vec3(c * q.x - s * q.y, hold + s * q.x + c * q.y, q.z);
    flagNormal = vec3(c * m.x - s * m.y, s * m.x + c * m.y, m.z);
  }
`;

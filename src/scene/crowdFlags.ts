import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded, type Holding } from './crowd';
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
/** How far below the middle of the bearer's hand the pole ends: inside their fist. */
const POLE_BELOW_HOLD = 0.01;
/** The room a flag takes is measured in layers this high. */
const SLICE = 0.1;
/** Space kept free between a flag and anything else, on top of the people's own room. */
const MARGIN = 0.03;
/** The same between the pole and its bearer's own face (it's right in front of it). */
const OWN_MARGIN = 0.01;
/** 0..1: how much the cloth's sag changes as it ripples, either way (the same as the shader). */
const SAG_FLUTTER = 0.3;
/** How much stronger the ripples' shading is than their shape, so the cloth's folds show from afar. */
const FOLD_SHADING = 2.5;
/** Below this high up a bearer (size 1), they stand as everyone else does. */
const BELOW_HEAD = 0.45;
/** How many swing positions the flag's room is measured at, from one side to the other. */
const SWEEP_STEPS = 9;

/** Where a flag stands, and whose it is. */
export interface FlagSpot {
  /** Where the pole stands (in the bearer's hand), on the floor of the bearer's step. */
  x: number;
  y: number;
  z: number;
  /** How high above that floor the bearer holds it: their hand, where it swings about. */
  hold: number;
  /** Which side of the bearer the pole is (1: their left, -1: their right). */
  side: 1 | -1;
  /** Turn about the up axis, in radians: the cloth goes out along the flag's own +x, turned by this (as the crowd's angles). */
  angle: number;
  /** The bearer: the person holding it, as an index into the crowd's spots. */
  holder: number;
  /** This flag's own waving (see `FlagMotion`). */
  motion: FlagMotion;
}

/** How one flag waves, so they don't all move alike. */
export interface FlagMotion {
  /** How much higher than `poleHeight` its pole's top is, in metres. */
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
 * The room a flag takes up while it waves, in its own space (the pole at x = z = 0, held `hold`
 * above the floor at y = 0, the cloth going out along +x): a box for each layer of the space it
 * sweeps through, at every swing and lift, and with its ripples at their furthest either way.
 */
export function flagShape(
  s: CrowdFlagSettings,
  hold: number,
  m: FlagMotion = { raise: 0, swing: s.swing, lift: s.lift },
): PersonBox[] {
  const triangles: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) =>
    triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const lift of [0, m.lift / 2, m.lift]) {
    // The whole flag goes up and down as the bearer lifts it (as in the shader), its pole's top is raised by its
    // own amount, and it swings about where it's held.
    const pivot = hold + lift;
    const bottom = pivot - POLE_BELOW_HOLD;
    const top = s.poleHeight + m.raise + lift;
    for (let k = 0; k < SWEEP_STEPS; k++) {
      const tilt = THREE.MathUtils.degToRad(m.swing) * ((2 * k) / (SWEEP_STEPS - 1) - 1);
      const c = Math.cos(tilt);
      const sn = Math.sin(tilt);
      const at = (x: number, y: number, z: number) => [x * c - (y - pivot) * sn, pivot + x * sn + (y - pivot) * c, z];
      const r = POLE_RADIUS;
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
 * Picks a bearer for each flag: the person nearest to each place in `s.places` who can hold it up
 * in their hand beside them (see `Holding`), with room round it for the cloth to wave in, without
 * the flag or the bearer's raised arm touching the stadium, anyone else in the crowd (in any of
 * their moves) or another flag, and without the pole going through the bearer's own head or body.
 * The cloth goes out to the side the bearer holds it on, one side or the other, whichever has room
 * (the flags take turns which side they try first), turned a little by its own random amount (up
 * to the settings' `turn`). Places with no room near them get no flag.
 */
export function placeFlags(
  spots: CrowdSpot[],
  room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] },
  holding: Holding,
  s: CrowdFlagSettings,
  random: () => number = seeded(s.seed),
): FlagSpot[] {
  const motions = flagMotions(s, random);
  const turns = s.places.map(() => THREE.MathUtils.degToRad(s.turn) * (random() * 2 - 1));
  const stadium = new TriangleIndex(room.stadium);
  const onPerson = (p: CrowdSpot, boxes: PersonBox[]): PlacedBox[] =>
    boxes.map((b) => ({
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
    }));
  const peopleBoxes = spots.map((p) => onPerson(p, room.shapes[p.look][p.moves]));
  const touch = (a: PlacedBox[], b: PlacedBox[]) =>
    a.some((p) => b.some((q) => p.lo < q.hi && q.lo < p.hi && rectsOverlap(p.rect, q.rect)));
  const inStadium = (boxes: PlacedBox[]) => boxes.some((b) => stadium.touches(b.rect, b.lo, b.hi));

  // Each row's people in order round the stands: from the left side near the camera, round behind the goal, to the right side.
  const middleZ = spots.reduce((sum, p) => sum + p.z, 0) / Math.max(spots.length, 1);
  const rows = new Map<number, number[]>();
  spots.forEach((p, i) => rows.set(p.row, [...(rows.get(p.row) ?? []), i]));
  for (const row of rows.values()) {
    row.sort((a, b) => Math.atan2(spots[a].x, middleZ - spots[a].z) - Math.atan2(spots[b].x, middleZ - spots[b].z));
  }

  const flags: FlagSpot[] = [];
  const placed: PlacedBox[][] = [];
  const bearers = new Set<number>();
  s.places.forEach((place, n) => {
    const row = rows.get(place.row);
    if (!row) return;
    const target = Math.round(THREE.MathUtils.clamp(place.along, 0, 1) * (row.length - 1));
    const order = row.map((_, k) => k).sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    for (const k of order) {
      const holder = row[k];
      if (bearers.has(holder)) continue;
      const p = spots[holder];
      for (const side of n % 2 === 0 ? ([1, -1] as const) : ([-1, 1] as const)) {
        // The pole in their hand, and the cloth out to that side.
        const hand = holding.hand[side];
        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        const x = p.x + (hand.x * cos + hand.z * sin) * p.size;
        const z = p.z + (-hand.x * sin + hand.z * cos) * p.size;
        const hold = hand.y * p.size;
        const angle = p.angle + (side > 0 ? 0 : Math.PI) + turns[n];
        const shape = flagShape(s, hold, motions[n]);
        const reach = Math.max(...shape.map((b) => Math.hypot(Math.max(-b.x0, b.x1), Math.max(-b.z0, b.z1)))) + 1;
        const around = (margin: number) =>
          shape.map((b) => ({
            rect: { x, z, angle, x0: b.x0 - margin, x1: b.x1 + margin, z0: b.z0 - margin, z1: b.z1 + margin },
            lo: p.y + b.y0 - margin,
            hi: p.y + b.y1 + margin,
          }));
        const boxes = around(MARGIN);
        const still = onPerson(p, holding.still[p.look]);
        if (touch(around(OWN_MARGIN), still)) continue;
        // The bearer's raised arm, and their head looking up (as they bob with the flag's lifting).
        const lifted = (b: PlacedBox) => ({ ...b, hi: b.hi + motions[n].lift });
        const bearer = [
          ...onPerson(p, holding.arm[side]).map(lifted),
          ...still.filter((b) => b.lo > p.y + BELOW_HEAD * p.size).map(lifted),
        ];
        if (inStadium(boxes) || inStadium(bearer)) continue;
        const others = spots.some(
          (q, i) =>
            i !== holder &&
            Math.hypot(q.x - x, q.z - z) < reach &&
            (touch(peopleBoxes[i], boxes) || touch(peopleBoxes[i], bearer)),
        );
        if (others || placed.some((f) => touch(f, boxes) || touch(f, bearer))) continue;
        placed.push([...boxes, ...bearer]);
        bearers.add(holder);
        flags.push({ x, y: p.y, z, hold, side, angle, holder, motion: motions[n] });
        return;
      }
    }
  });
  return flags;
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
    uPoleHeight: { value: 0 },
    uPoleColor: { value: new THREE.Color() },
    uLogo: { value: null as THREE.Texture | null },
    uLogoRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  };

  constructor(
    crowd: {
      spots: CrowdSpot[];
      room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] };
      holding: Holding;
      hold(person: number, side: 1 | -1, lift: number, often: number, start: number): void;
    },
    envMap: THREE.Texture | null,
    logo: FlagLogo | null,
    s: CrowdFlagSettings = CROWD_FLAG_SETTINGS,
  ) {
    const random = seeded(s.seed);
    this.flags = s.flags ? placeFlags(crowd.spots, crowd.room, crowd.holding, s, random) : [];
    const u = this.uniforms;
    u.uSwingSpeed.value = s.swingSpeed;
    u.uLiftSpeed.value = s.liftSpeed;
    u.uRipple.value = s.ripple;
    u.uSag.value = s.sag;
    u.uRippleSpeed.value = s.rippleSpeed;
    u.uWidth.value = s.width;
    u.uPoleHeight.value = s.poleHeight;
    u.uPoleColor.value.set(s.poleColor);
    if (logo && s.logoSize > 0) {
      // The logo in the middle of the cloth, `logoSize` of its height (or less, to fit its width), in the cloth's UVs.
      const height = Math.min(s.logoSize, (s.logoSize * s.width) / (s.height * logo.aspect));
      const width = (height * s.height * logo.aspect) / s.width;
      u.uLogo.value = logo.texture;
      u.uLogoRect.value.set(0.5 - width / 2, 0.5 - height / 2, width, height);
    }

    // The pole from 0 to 1 high: the shader stretches it from just below each bearer's hand to its own top.
    const pole = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, 1, 8, 1);
    pole.translate(0, 0.5, 0);
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
    // Each flag's start in its waving, its speed, how far it swings (radians) and is lifted; how much longer its
    // pole is, its lifting's start, and how high it's held. Its bearer bobs along with its lifting.
    const own = new Float32Array(this.flags.length * 4);
    const poles = new Float32Array(this.flags.length * 3);
    this.flags.forEach((f, i) => {
      const speed = 1 - s.speedVariety + 2 * s.speedVariety * random();
      const liftStart = random();
      own.set([random(), speed, THREE.MathUtils.degToRad(f.motion.swing), f.motion.lift], i * 4);
      poles.set([f.motion.raise, liftStart, f.hold], i * 3);
      crowd.hold(f.holder, f.side, f.motion.lift, s.liftSpeed * speed, liftStart);
    });
    geometry.setAttribute('aFlag', new THREE.InstancedBufferAttribute(own, 4));
    geometry.setAttribute('aPole', new THREE.InstancedBufferAttribute(poles, 3));

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
// free end sagging a little, the pole from just below the bearer's hand up to its own top and the
// cloth raised with it, the whole flag lifted (its bearer bobbing along), then swung to the side
// about the hand.
const WAVE = /* glsl */ `
  attribute float aCloth; // 1 on the cloth, 0 on the pole
  attribute vec4 aFlag; // this flag's start in its waving (0..1), its speed, how far it swings (radians) and is lifted (m)
  attribute vec3 aPole; // how much longer its pole is (m), its lifting's start (0..1), and how high it's held (m)
  uniform float uFlagTime, uSwingSpeed, uLiftSpeed, uRipple, uRippleSpeed, uSag, uWidth, uPoleHeight;
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
    float top = uPoleHeight + aPole.x;
    q.y = aCloth > 0.5 ? q.y + aPole.x : mix(aPole.z - ${POLE_BELOW_HOLD.toFixed(2)}, top, p.y);
    float up = aFlag.w * (0.5 - 0.5 * cos(6.2832 * (uLiftSpeed * t + aPole.y)));
    float hold = aPole.z + up;
    q.y += up;
    float tilt = aFlag.z * sin(6.2832 * uSwingSpeed * t + start);
    float c = cos(tilt);
    float s = sin(tilt);
    q.y -= hold;
    flagPosition = vec3(c * q.x - s * q.y, hold + s * q.x + c * q.y, q.z);
    flagNormal = vec3(c * m.x - s * m.y, s * m.x + c * m.y, m.z);
  }
`;

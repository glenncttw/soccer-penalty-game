import { hash, random } from './random';
import type { SkySettings } from './skySettings';

/** Shader limits: how many clouds the sky holds, and round lobes per cloud. */
export const MAX_CLOUDS = 16;
export const MAX_LOBES = 7;
/**
 * The sky repeats every 120° around the stadium (three times in a full turn), so
 * a cloud that drifts off one end of the band comes back in at the other with no seam.
 */
export const CLOUD_BAND = (2 * Math.PI) / 3;

const DEG = Math.PI / 180;
const NEAR_WIDTH = 12 * DEG; // the nearest clouds at cloudScale 1

/**
 * One round puff of a cloud: a sphere, in cloud units. A cloud is 1 wide with
 * x = 0 in its middle and its flat bottom at y = 0; z points toward the viewer
 * and is only used for shading.
 */
export interface Lobe {
  x: number;
  y: number;
  z: number;
  r: number;
}

/**
 * The long, rounded base every cloud sits on: a capsule lying along the flat
 * bottom (half of it below), from `left` to `right` with rounded ends of `radius`.
 */
export interface CloudBase {
  left: number;
  right: number;
  radius: number;
}

export interface Cloud {
  /** Which row it drifts in: 0 = the farthest, higher numbers are nearer. */
  layer: number;
  /**
   * Direction of the middle of its flat bottom at time 0, in radians: azimuth
   * (0 = straight toward the goal, positive = to the right) and elevation above the horizon.
   */
  azimuth: number;
  elevation: number;
  /** Angular width, in radians. */
  width: number;
  /** Height in cloud units (its height divided by its width). */
  height: number;
  /** Drift in radians per second, positive = to the right. */
  speed: number;
  /** 0..1: how much it fades toward the sky colour (far clouds are hazier). */
  haze: number;
  /** How strongly its lobes shade each other, around 1. */
  shade: number;
  /** It shows once cloudCoverage is above this. */
  rank: number;
  base: CloudBase;
  /** Back to front: each lobe sits in front of the ones before it. */
  lobes: Lobe[];
}

// Each layer is a row of clouds drifting at its own speed, listed far to near.
// `elevation` is the range (degrees) for the clouds' flat bottoms. `distance`
// (0 = near, 1 = far) is scaled by cloudLayerDepth. `phase` puts the row's first
// cloud at that azimuth (degrees) at the start, which sets the opening view: a big
// cloud left of the goal and another at the right edge, a medium one to the right,
// small ones low down, and a high one in the middle that only taller screens show.
const LAYERS = [
  { share: 0.35, elevation: [8, 10], distance: 1, phase: -5 }, // far: small, peeking over the stand
  { share: 0.3, elevation: [9.5, 11.5], distance: 0.5, phase: 9 }, // middle
  { share: 0.15, elevation: [15.5, 20], distance: 0.25, phase: 6 }, // high: above a desktop screen, seen on phones
  { share: 0.2, elevation: [8.5, 10.5], distance: 0, phase: -12 }, // near: big
] as const;

/** Builds the clouds for these settings: the same settings always give the same clouds. Sorted far to near. */
export function createClouds(s: SkySettings): Cloud[] {
  const total = Math.max(0, Math.min(MAX_CLOUDS, Math.round(s.cloudCount)));
  const counts = layerCounts(total);
  const clouds: Cloud[] = [];
  LAYERS.forEach((layer, index) => {
    const n = counts[index];
    const spacing = CLOUD_BAND / n;
    const far = layer.distance * clamp01(s.cloudLayerDepth);
    for (let k = 0; k < n; k++) {
      // Each cloud has its own random stream, so changing one layer's count leaves the others alone.
      const rng = random(hash(s.cloudSeed, index, k));
      const vary = () => rng() * 2 - 1;
      const size = s.cloudScale * (1 - 0.5 * far);
      // A cloud stays inside its slot of the row, so clouds in one layer never overlap.
      const width = Math.min(NEAR_WIDTH * size * (1 + 0.35 * clamp01(s.cloudWidthVariation) * vary()), 0.85 * spacing);
      const shift = 0.3 * (spacing - width) * vary();
      const [lo, hi] = layer.elevation;
      const elevation = lo + (hi - lo) * rng();
      const shape = cloudShape(rng, clamp01(s.cloudWidthVariation), clamp01(s.cloudHeightVariation));
      clouds.push({
        layer: index,
        azimuth: wrapAngle(layer.phase * DEG + k * spacing + shift),
        elevation: elevation * DEG,
        width,
        height: shape.height,
        speed: s.cloudSpeed * DEG * (1 - 0.6 * far),
        haze: 0.25 * far,
        shade: 1 + 0.2 * vary(),
        rank: 0.92 * rng(),
        base: shape.base,
        lobes: shape.lobes,
      });
    }
  });
  return clouds;
}

/** Splits the clouds over the layers by their shares, rounding fairly. */
function layerCounts(total: number): number[] {
  const raw = LAYERS.map((l) => l.share * total);
  const counts = raw.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ rest: r - counts[i], i })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) if (left-- > 0) counts[i]++;
  return counts;
}

/**
 * One cloud's shape: a big dome near the middle, a lower shoulder on each side,
 * and between one and four more puffs (small ends and low puffs in front), all
 * sitting on a long, rounded base along the flat bottom. 4 to 7 lobes in all.
 */
function cloudShape(rng: () => number, widthVariation: number, heightVariation: number) {
  const vary = () => rng() * 2 - 1;
  const count = 4 + Math.floor(rng() * 4);
  const spread = 1 + 0.25 * widthVariation * vary();
  const baseRadius = 0.45 + 0.15 * rng();

  // Built in units of the dome's radius, then scaled to a width of 1.
  const dome: Lobe = { x: 0, y: 0.85 + 0.25 * heightVariation * vary(), z: 0, r: 1 };
  const shoulders = [-1, 1].map((side) => {
    const r = 0.55 + 0.2 * rng();
    const peak = dome.y + dome.r - (0.45 + 0.35 * rng()); // a step down from the dome's top
    return { x: side * (1.0 + 0.5 * r) * spread, y: peak - r, z: 0, r };
  });
  const first = rng() < 0.5 ? -1 : 1; // the side that gets the first end and front puff
  const sides = (n: number) => (n === 2 ? [first, -first] : n === 1 ? [first] : []);
  const ends = sides(count >= 6 ? 2 : count - 4).map((side) => {
    const s = shoulders[side < 0 ? 0 : 1];
    const r = 0.35 + 0.15 * rng();
    return { x: s.x + side * (0.9 * s.r + 0.3 * r) * spread, y: 0.3 * r, z: 0, r };
  });
  const fronts = sides(count === 7 ? 2 : 1).map((side) => {
    const r = 0.6 + 0.25 * rng();
    return { x: side * (0.3 + 0.5 * rng()), y: 0.3 + 0.2 * rng(), z: 0, r };
  });

  // The base reaches past the outermost puffs (further on a side without a small end
  // puff), so the cloud tapers into long, low, rounded tips.
  const top = [dome, ...shoulders, ...ends];
  const lo = Math.min(...top.map((l) => l.x - l.r));
  const hi = Math.max(...top.map((l) => l.x + l.r));
  const tip = (side: number) => 0.1 + 0.2 * rng() + (ends.some((e) => Math.sign(e.x) === side) ? 0 : 0.25);
  const base: CloudBase = { left: lo - tip(-1) + baseRadius, right: hi + tip(1) - baseRadius, radius: baseRadius };

  // Back to front: each shoulder sits behind or in front of the dome, then the ends, then the low front puffs.
  const behind = shoulders.filter(() => rng() < 0.5);
  const lobes = [...behind, dome, ...shoulders.filter((s) => !behind.includes(s)), ...ends, ...fronts];
  for (const l of lobes) restOnBase(l, base);
  placeInDepth(lobes, base);
  return normalise(lobes, base);
}

/** Height of the base's top above the flat bottom at x (0 past its ends). */
function baseTop(base: CloudBase, x: number) {
  const out = x < base.left ? base.left - x : x > base.right ? x - base.right : 0;
  return Math.sqrt(Math.max(0, base.radius * base.radius - out * out));
}

/** Lowers a lobe until it sinks a little into the base, so no lobe floats above it. */
function restOnBase(l: Lobe, base: CloudBase) {
  const sink = base.radius * 0.35;
  const bottom = l.y - l.r;
  const surface = baseTop(base, l.x) - sink;
  if (bottom > surface) l.y -= bottom - surface;
}

/**
 * Gives each lobe a depth just in front of everything placed before it where they
 * overlap, so its whole outline shows over them (which the shading turns into a
 * soft crease and shadow, like the reference).
 */
function placeInDepth(lobes: Lobe[], base: CloudBase) {
  const margin = 0.05;
  lobes.forEach((l, i) => {
    let z = baseTop(base, l.x) + margin; // the base is the backmost part
    for (const o of lobes.slice(0, i)) {
      const d = Math.hypot(l.x - o.x, l.y - o.y);
      if (d >= l.r + o.r) continue;
      // The highest point of `o` under the rim of `l` is where the rim comes closest to o's centre.
      const near = Math.abs(d - l.r);
      z = Math.max(z, o.z + Math.sqrt(Math.max(0, o.r * o.r - near * near)) + margin);
    }
    l.z = z;
  });
}

/** Scales the cloud to a width of 1 with x = 0 in the middle; returns its height too. */
function normalise(lobes: Lobe[], base: CloudBase) {
  const lo = Math.min(base.left - base.radius, ...lobes.map((l) => l.x - halfChord(l)));
  const hi = Math.max(base.right + base.radius, ...lobes.map((l) => l.x + halfChord(l)));
  const scale = 1 / (hi - lo);
  const mid = (lo + hi) / 2;
  const out = lobes.map((l) => ({ x: (l.x - mid) * scale, y: l.y * scale, z: l.z * scale, r: l.r * scale }));
  return {
    lobes: out,
    base: { left: (base.left - mid) * scale, right: (base.right - mid) * scale, radius: base.radius * scale },
    height: Math.max(base.radius * scale, ...out.map((l) => l.y + l.r)),
  };
}

/** Half the width of the part of a lobe above the flat bottom. */
function halfChord(l: Lobe) {
  return l.y >= 0 ? l.r : Math.sqrt(Math.max(0, l.r * l.r - l.y * l.y));
}

/** Packs the clouds into the arrays the sky shader reads (see sky.ts). */
export function packClouds(clouds: Cloud[]) {
  const place = new Float32Array(MAX_CLOUDS * 4);
  const look = new Float32Array(MAX_CLOUDS * 4);
  const base = new Float32Array(MAX_CLOUDS * 4);
  const lobes = new Float32Array(MAX_CLOUDS * MAX_LOBES * 4);
  clouds.slice(0, MAX_CLOUDS).forEach((c, i) => {
    place.set([c.azimuth, c.elevation, c.width, c.speed], i * 4);
    look.set([c.haze, c.shade, c.height, c.rank], i * 4);
    base.set([c.base.left, c.base.right, c.base.radius, 0], i * 4);
    c.lobes.slice(0, MAX_LOBES).forEach((l, j) => lobes.set([l.x, l.y, l.z, l.r], (i * MAX_LOBES + j) * 4));
  });
  return { count: Math.min(clouds.length, MAX_CLOUDS), place, look, base, lobes };
}

/** Wraps an angle into the band, -60°..60°. */
function wrapAngle(a: number) {
  return a - CLOUD_BAND * Math.round(a / CLOUD_BAND);
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

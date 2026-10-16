import * as THREE from 'three';
import { random } from './random';

/** One short, curved blade of grass in a texture tile. Positions and sizes are in tile units (0..1). */
export interface Blade {
  x: number;
  y: number;
  /** Direction from root to tip, in radians. */
  angle: number;
  length: number;
  /** How much it curls sideways: a share of its length, negative curls the other way. */
  bend: number;
  /** 0..1: how bright its tip is. Neighbouring blades are similar, so the turf looks clumpy. */
  shade: number;
}

/** A straight, tapering piece of a blade, in texture pixels: from (x0, y0) with radius r0 and brightness l0 to (x1, y1). */
export interface BladePiece {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r0: number;
  r1: number;
  l0: number;
  l1: number;
}

export const TILE_PIXELS = 512;
const BLADE_COUNT = 5000;
const PIECES = 3; // straight pieces per curved blade
const ROOT_RADIUS = 2.4; // pixels; blades taper to TIP_RADIUS
const TIP_RADIUS = 0.7;
const ROOT_LIGHT = 0.5; // blades get brighter toward their tips
const GAP_LIGHT = 0.32; // the shady ground between blades

/** Scatters curly blades over one tile, the same ones for the same seed. */
export function createBlades(seed: number, count = BLADE_COUNT): Blade[] {
  const rng = random(seed);
  // Gentle light and dark patches that wrap around the tile edges.
  const phase = [rng(), rng(), rng()].map((p) => p * 2 * Math.PI);
  const clump = (x: number, y: number) =>
    (Math.sin(2 * Math.PI * (2 * x + y) + phase[0]) +
      Math.sin(2 * Math.PI * (x - 3 * y) + phase[1]) +
      Math.sin(2 * Math.PI * (3 * x + 2 * y) + phase[2])) /
      6 +
    0.5;
  return Array.from({ length: count }, () => {
    const x = rng();
    const y = rng();
    return {
      x,
      y,
      angle: rng() * 2 * Math.PI,
      length: 0.035 + 0.025 * rng(),
      bend: (rng() - 0.5) * 1.2,
      shade: 0.72 + 0.28 * (0.5 * rng() + 0.5 * clump(x, y)),
    };
  });
}

/** Points along a blade from root to tip, in tile units. */
export function bladePoints(b: Blade, pieces = PIECES): [number, number][] {
  const dx = Math.cos(b.angle) * b.length;
  const dy = Math.sin(b.angle) * b.length;
  // A quadratic curve whose middle is pushed sideways by `bend`.
  const cx = b.x + dx / 2 - dy * b.bend;
  const cy = b.y + dy / 2 + dx * b.bend;
  return Array.from({ length: pieces + 1 }, (_, i) => {
    const t = i / pieces;
    const u = 1 - t;
    return [u * u * b.x + 2 * u * t * cx + t * t * (b.x + dx), u * u * b.y + 2 * u * t * cy + t * t * (b.y + dy)];
  });
}

/**
 * Cuts the blades into straight pieces, in drawing order: every root piece
 * first and every tip last, so tips lie on top. A piece that crosses the
 * tile's edge is repeated on the other side, so the tile repeats seamlessly.
 */
export function bladePieces(blades: Blade[], size = TILE_PIXELS): BladePiece[] {
  const pieces: BladePiece[] = [];
  const points = blades.map((b) => bladePoints(b));
  const radius = (t: number) => ROOT_RADIUS + (TIP_RADIUS - ROOT_RADIUS) * t;
  const margin = ROOT_RADIUS + 1;
  for (let k = 0; k < PIECES; k++) {
    blades.forEach((b, i) => {
      const [x0, y0] = points[i][k].map((v) => v * size);
      const [x1, y1] = points[i][k + 1].map((v) => v * size);
      const light = (t: number) => b.shade * (ROOT_LIGHT + (1 - ROOT_LIGHT) * t);
      const piece = { r0: radius(k / PIECES), r1: radius((k + 1) / PIECES), l0: light(k / PIECES), l1: light((k + 1) / PIECES) };
      for (const ox of wrapShifts(Math.min(x0, x1) - margin, Math.max(x0, x1) + margin, size)) {
        for (const oy of wrapShifts(Math.min(y0, y1) - margin, Math.max(y0, y1) + margin, size)) {
          pieces.push({ x0: x0 + ox, y0: y0 + oy, x1: x1 + ox, y1: y1 + oy, ...piece });
        }
      }
    });
  }
  return pieces;
}

/** Shifts by a whole tile at which something spanning lo..hi overlaps the tile. */
function wrapShifts(lo: number, hi: number, size: number) {
  const shifts = [0];
  if (hi > size) shifts.push(-size);
  if (lo < 0) shifts.push(size);
  return shifts;
}


/**
 * Draws the blades on the graphics card into a small greyscale picture that
 * tiles seamlessly: bright blade tips over darker gaps. It takes a few
 * milliseconds, once, when the game loads. The grass shader colours it and
 * repeats it over the pitch. Its smallest mipmap (1 x 1 pixel) holds its
 * average brightness, which is what it blurs to in the distance.
 */
export function renderBladeTexture(renderer: THREE.WebGLRenderer, seed: number): THREE.WebGLRenderTarget {
  const size = TILE_PIXELS;
  const pieces = bladePieces(createBlades(seed), size);

  // One quad per piece, big enough for the piece and its round ends.
  const corners = new Float32Array(pieces.length * 4 * 3);
  const segment = new Float32Array(pieces.length * 4 * 4);
  const shape = new Float32Array(pieces.length * 4 * 4);
  const index = new Uint32Array(pieces.length * 6);
  pieces.forEach((p, i) => {
    const pad = Math.max(p.r0, p.r1) + 1;
    const box = [
      [Math.min(p.x0, p.x1) - pad, Math.min(p.y0, p.y1) - pad],
      [Math.max(p.x0, p.x1) + pad, Math.min(p.y0, p.y1) - pad],
      [Math.max(p.x0, p.x1) + pad, Math.max(p.y0, p.y1) + pad],
      [Math.min(p.x0, p.x1) - pad, Math.max(p.y0, p.y1) + pad],
    ];
    box.forEach(([x, y], c) => {
      corners.set([x, y, 0], (i * 4 + c) * 3);
      segment.set([p.x0, p.y0, p.x1, p.y1], (i * 4 + c) * 4);
      shape.set([p.r0, p.r1, p.l0, p.l1], (i * 4 + c) * 4);
    });
    index.set([0, 1, 2, 0, 2, 3].map((c) => i * 4 + c), i * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(corners, 3));
  geometry.setAttribute('aSegment', new THREE.BufferAttribute(segment, 4));
  geometry.setAttribute('aShape', new THREE.BufferAttribute(shape, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const quads = new THREE.Mesh(geometry, material);
  quads.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quads);
  const camera = new THREE.OrthographicCamera(0, size, size, 0, -1, 1);

  const target = new THREE.WebGLRenderTarget(size, size, {
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true,
    anisotropy: renderer.capabilities.getMaxAnisotropy(), // stays crisp where you look across the pitch
    depthBuffer: false,
  });
  target.texture.name = 'GrassBlades';

  const before = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(new THREE.Color(GAP_LIGHT, GAP_LIGHT, GAP_LIGHT), 1);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(before);
  renderer.setClearColor(clear, clearAlpha);
  geometry.dispose();
  material.dispose();
  return target;
}

const BLADE_VERTEX = /* glsl */ `
attribute vec4 aSegment;
attribute vec4 aShape;
varying vec2 vPixel;
varying vec4 vSegment;
varying vec4 vShape;
void main() {
  vPixel = position.xy;
  vSegment = aSegment;
  vShape = aShape;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Each piece is a capsule that narrows from one end to the other, with soft
// (anti-aliased) edges and brightness running along it.
const BLADE_FRAGMENT = /* glsl */ `
varying vec2 vPixel;
varying vec4 vSegment;
varying vec4 vShape;
void main() {
  vec2 a = vSegment.xy;
  vec2 ab = vSegment.zw - a;
  float t = clamp(dot(vPixel - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float edge = length(vPixel - a - ab * t) - mix(vShape.x, vShape.y, t);
  float cover = clamp(0.5 - edge, 0.0, 1.0);
  if (cover <= 0.0) discard;
  gl_FragColor = vec4(vec3(mix(vShape.z, vShape.w, t)), cover);
}
`;

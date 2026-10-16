import * as THREE from 'three';
import { GRASS_SETTINGS, type GrassSettings } from './grassSettings';
import { renderBladeTexture } from './grassTexture';
import { STADIUM_NODES } from './measureStadium';

/** The shader holds up to this many dark stripes. */
export const MAX_STRIPES = 16;

export interface PitchStripes {
  /** The grass meshes, and which of their two materials is the light one and the dark one. */
  meshes: THREE.Mesh[];
  light: THREE.Material & { color: THREE.Color };
  dark: THREE.Material & { color: THREE.Color };
  /** Where the dark stripes are, as [left, right] world x in metres, left to right. */
  darkStripes: [number, number][];
}

type Coloured = THREE.Material & { color: THREE.Color };

/**
 * Reads the stripes from the model: the grass has two materials, and the
 * triangles that use the darker one are the dark stripes. The stripes run toward
 * the goal, so each one is a range of x.
 */
export function measureStripes(grass: THREE.Object3D): PitchStripes {
  grass.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  grass.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const materials = [...new Set(meshes.map((m) => m.material as Coloured))];
  if (materials.length !== 2 || materials.some((m) => Array.isArray(m) || !m.color)) {
    throw new Error(`The stadium's "${grass.name}" should have exactly two grass materials, a light and a dark one`);
  }
  const brightness = (m: Coloured) => m.color.r + m.color.g + m.color.b;
  const [dark, light] = materials.sort((a, b) => brightness(a) - brightness(b));

  // Each dark triangle covers a range of x; touching ranges belong to one stripe.
  const ranges: [number, number][] = [];
  const v = new THREE.Vector3();
  for (const mesh of meshes.filter((m) => m.material === dark)) {
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const corners = index ? index.count : pos.count;
    for (let i = 0; i < corners; i += 3) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld);
        lo = Math.min(lo, v.x);
        hi = Math.max(hi, v.x);
      }
      if (hi - lo > 1e-4) ranges.push([lo, hi]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const darkStripes: [number, number][] = [];
  for (const r of ranges) {
    const last = darkStripes[darkStripes.length - 1];
    if (last && r[0] <= last[1] + 1e-3) last[1] = Math.max(last[1], r[1]);
    else darkStripes.push([r[0], r[1]]);
  }
  if (darkStripes.length > MAX_STRIPES) {
    throw new Error(`The grass has ${darkStripes.length} dark stripes; the shader holds up to ${MAX_STRIPES}`);
  }
  return { meshes, light, dark, darkStripes };
}

/**
 * Gives the pitch one grass material that draws, in a single pass:
 * - the mowing stripes from the model, with soft, slightly ragged edges,
 * - tiny curly blades from a small repeating texture, shuffled and turned from
 *   place to place so the repeat doesn't show,
 * - viewing-angle shading: grass in front of you, which you look down onto, is
 *   darker than grass you look across, because you see the shady gaps between
 *   the blades instead of their sunlit sides.
 * Sunlight and shadows work as before.
 */
export function applyGrass(stadium: THREE.Object3D, renderer: THREE.WebGLRenderer, s: GrassSettings = GRASS_SETTINGS) {
  const grass = stadium.getObjectByName(STADIUM_NODES.grass);
  if (!grass) throw new Error(`Stadium model is missing the "${STADIUM_NODES.grass}" node`);
  const stripes = measureStripes(grass);
  const blades = renderBladeTexture(renderer, s.bladeSeed);

  const stripeData = new Float32Array(MAX_STRIPES * 2);
  stripeData.set(stripes.darkStripes.flat());
  const uniforms = {
    uGrassLight: { value: new THREE.Color(s.colorLight) },
    uGrassDark: { value: new THREE.Color(s.colorDark) },
    uStripes: { value: stripeData },
    uStripeCount: { value: stripes.darkStripes.length },
    uStripeSoftness: { value: s.stripeSoftness },
    uStripeRagged: { value: s.stripeRagged },
    uBlades: { value: blades.texture },
    uBladeTile: { value: s.bladeTileSize },
    uBladeStretch: { value: s.bladeStretch },
    uBladeContrast: { value: s.bladeContrast },
    uBladeWarmth: { value: s.bladeTipWarmth },
    uAngleShading: { value: s.angleShading },
  };

  // Start from the model's light grass so roughness and the sun's sheen stay as in Blender.
  const material = stripes.light.clone() as THREE.MeshStandardMaterial;
  material.name = 'M_Grass_Shader';
  material.color.set(0xffffff);
  material.map = null;
  material.defines = { ...material.defines, MAX_STRIPES };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvGrassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRASS_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${GRASS_COLOR}`);
  };
  material.addEventListener('dispose', () => blades.dispose());

  for (const old of [stripes.light, stripes.dark]) {
    for (const value of Object.values(old)) if (value instanceof THREE.Texture) value.dispose();
    old.dispose();
  }
  for (const mesh of stripes.meshes) mesh.material = material;
  return material;
}

const GRASS_PARS = /* glsl */ `
varying vec3 vGrassWorld;
uniform vec3 uGrassLight;
uniform vec3 uGrassDark;
uniform vec2 uStripes[MAX_STRIPES];
uniform int uStripeCount;
uniform float uStripeSoftness;
uniform float uStripeRagged;
uniform sampler2D uBlades;
uniform float uBladeTile;
uniform float uBladeStretch;
uniform float uBladeContrast;
uniform float uBladeWarmth;
uniform float uAngleShading;

// A random number per grid cell (no sin(), so it is the same on every phone).
float grassHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Smooth random values: changes gently from cell to cell.
float grassNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(grassHash(i), grassHash(i + vec2(1.0, 0.0)), u.x),
    mix(grassHash(i + vec2(0.0, 1.0)), grassHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// One copy of the blade tile, turned and shifted. The derivatives keep the
// texture's blurring for distance (mipmaps) seamless across the copies.
float grassTile(vec2 uv, vec2 dx, vec2 dy, float copy) {
  float a = copy * 2.39996; // the golden angle: every copy turns differently
  mat2 turn = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 shift = vec2(grassHash(vec2(copy, 7.0)), grassHash(vec2(copy, 13.0)));
  return textureGrad(uBlades, turn * uv + shift, turn * dx, turn * dy).r;
}

// The blades, with the repeat hidden: a smooth random map picks which turned and
// shifted copy of the tile shows where, and blends neighbouring copies.
float grassBlades(vec2 uv) {
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  float pick = grassNoise(uv * 0.6) * 8.0;
  float copy = floor(pick);
  float a = grassTile(uv, dx, dy, copy);
  float b = grassTile(uv, dx, dy, copy + 1.0);
  return mix(a, b, smoothstep(0.25, 0.75, fract(pick) + 0.3 * (b - a)));
}
`;

const GRASS_COLOR = /* glsl */ `
{
  float blade = grassBlades(vGrassWorld.xz / (uBladeTile * vec2(1.0, uBladeStretch)));
  float mean = textureLod(uBlades, vec2(0.5), 16.0).r; // the 1 x 1 mipmap: the average
  float detail = blade - mean; // brighter on blade tips, darker in the gaps

  // Stripes: blades nibble the edge, and the blend is never thinner than a pixel.
  float x = vGrassWorld.x + uStripeRagged * detail * 2.0;
  float edge = 0.5 * max(max(uStripeSoftness, fwidth(vGrassWorld.x)), 1e-4);
  float dark = 0.0;
  for (int i = 0; i < MAX_STRIPES; i++) {
    if (i >= uStripeCount) break;
    vec2 s = uStripes[i];
    dark = max(dark, smoothstep(s.x - edge, s.x + edge, x) * (1.0 - smoothstep(s.y - edge, s.y + edge, x)));
  }
  vec3 grass = mix(uGrassLight, uGrassDark, dark);

  float d = uBladeContrast * detail;
  grass *= max(1.0 + d, 0.0) * vec3(1.0 + uBladeWarmth * d, 1.0, 1.0 - uBladeWarmth * d);

  // 0 where you look across the grass, 1 where you look down onto it. Red fades
  // a little faster, so close grass looks deeper green; dark stripes lose a
  // little more, so the stripes stand out more in front of you.
  float down = smoothstep(0.0, 0.35, normalize(cameraPosition - vGrassWorld).y);
  grass *= pow(vec3(max(1.0 - uAngleShading * down, 0.0)), vec3(1.2, 1.0, 1.0) * (1.0 + 0.85 * dark));

  diffuseColor.rgb *= grass;
}
`;

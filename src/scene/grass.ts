import * as THREE from 'three';
import { GRASS_SETTINGS, type GrassSettings } from './grassSettings';
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


/** The grass texture: a colour picture and a normal map that tile seamlessly. Replace these files to change the grass. */
export const GRASS_TEXTURE_URLS = {
  albedo: `${import.meta.env.BASE_URL}assets/grass/grass_albedo.webp`,
  normal: `${import.meta.env.BASE_URL}assets/grass/grass_normal.jpg`,
};

/** Loads the grass texture's two pictures, set up to repeat and to blur smoothly in the distance. */
export async function loadGrassTextures(renderer: THREE.WebGLRenderer) {
  const loader = new THREE.TextureLoader();
  const [albedo, normal] = await Promise.all([
    loader.loadAsync(GRASS_TEXTURE_URLS.albedo),
    loader.loadAsync(GRASS_TEXTURE_URLS.normal),
  ]);
  albedo.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace; // directions, not colours
  for (const t of [albedo, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // Mipmaps (smaller, blurred copies) and anisotropic filtering keep the grass
    // calm far away instead of sparkling.
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  return { albedo, normal };
}

export interface PaintMask {
  texture: THREE.Texture;
  /** World x of the mask's left edge and z of its near edge (toward the camera). */
  corner: THREE.Vector2;
  /** Width (x) and depth (z) the mask covers, in metres. */
  size: THREE.Vector2;
  dispose(): void;
}

const MASK_PIXEL = 0.01; // metres per mask pixel
const MASK_MAX = 2048;

/**
 * Turns the model's white markings into a map of where the grass is painted,
 * seen from straight above, and hides the markings themselves. The grass shader
 * then paints the grass white there, so the lines and spot look like painted
 * grass. Moving a line in Blender still moves the painted line.
 */
export function paintMaskFromMarkings(renderer: THREE.WebGLRenderer, markings: THREE.Object3D): PaintMask {
  markings.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(markings, true).expandByScalar(0.2);
  const size = new THREE.Vector2(box.max.x - box.min.x, box.max.z - box.min.z);
  const width = Math.min(MASK_MAX, Math.ceil(size.x / MASK_PIXEL));
  const height = Math.min(MASK_MAX, Math.ceil(size.y / MASK_PIXEL));

  // A camera above the pitch looking straight down, with the goal at the top.
  const centre = box.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-size.x / 2, size.x / 2, size.y / 2, -size.y / 2, 0.1, 100);
  camera.position.set(centre.x, box.max.y + 10, centre.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(centre.x, 0, centre.z);
  camera.updateMatrixWorld();

  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const scene = new THREE.Scene();
  markings.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const copy = new THREE.Mesh(o.geometry, white);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(o.matrixWorld);
    scene.add(copy);
  });

  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RedFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true,
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
    samples: 4, // smooth edges
    depthBuffer: false,
  });
  target.texture.name = 'PitchPaint';
  const before = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.render(scene, camera);
  renderer.setRenderTarget(before);
  renderer.setClearColor(clear, clearAlpha);
  white.dispose();

  markings.visible = false;
  return {
    texture: target.texture,
    corner: new THREE.Vector2(box.min.x, box.max.z),
    size,
    dispose: () => target.dispose(),
  };
}

/**
 * Gives the pitch one grass material that draws, in a single pass:
 * - the mowing stripes from the model, with soft edges that wobble a little,
 *   with see-through cross stripes laid over them from left to right,
 * - the grass texture (colour and normal map) around the stripe colours, shifted
 *   and mirrored from place to place so its repeat doesn't show,
 * - soft lighter and darker patches, so the pitch looks less flat,
 * - viewing-angle shading: grass in front of you, which you look down onto, is
 *   darker than grass you look across, because you see the shady gaps between
 *   the blades instead of their sunlit sides,
 * - the white lines and penalty spot, painted onto the grass.
 * Sunlight and shadows work as before.
 *
 * Returns the material and `update(settings)`, which applies new settings
 * straight away.
 */
export async function applyGrass(stadium: THREE.Object3D, renderer: THREE.WebGLRenderer, s: GrassSettings = GRASS_SETTINGS) {
  const grass = stadium.getObjectByName(STADIUM_NODES.grass);
  if (!grass) throw new Error(`Stadium model is missing the "${STADIUM_NODES.grass}" node`);
  const markings = stadium.getObjectByName(STADIUM_NODES.markings);
  if (!markings) throw new Error(`Stadium model is missing the "${STADIUM_NODES.markings}" node`);
  const stripes = measureStripes(grass);
  const textures = await loadGrassTextures(renderer);
  const paint = paintMaskFromMarkings(renderer, markings);

  const stripeData = new Float32Array(MAX_STRIPES * 2);
  stripeData.set(stripes.darkStripes.flat());
  const uniforms = {
    uGrassLight: { value: new THREE.Color() },
    uGrassDark: { value: new THREE.Color() },
    uStripes: { value: stripeData },
    uStripeCount: { value: stripes.darkStripes.length },
    uStripeSoftness: { value: 0 },
    uStripeRagged: { value: 0 },
    uCrossStripeWidth: { value: 0 },
    uCrossStripeOpacity: { value: 0 },
    uAlbedo: { value: textures.albedo },
    uNormal: { value: textures.normal },
    uTile: { value: new THREE.Vector2() },
    uViewFrom: { value: new THREE.Vector3(0, 1, 16) },
    uTextureStrength: { value: 0 },
    uNormalStrength: { value: 0 },
    uPatchStrength: { value: 0 },
    uPatchSize: { value: 0 },
    uAngleShading: { value: 0 },
    uPaint: { value: paint.texture },
    uPaintCorner: { value: paint.corner },
    uPaintSize: { value: paint.size },
    uLineColor: { value: new THREE.Color() },
    uLineRagged: { value: 0 },
    uLineWobble: { value: 0 },
    uLineTexture: { value: 0 },
    uLineGrassTint: { value: 0 },
  };
  // Settings only change uniforms, so they can change while the game runs (see the settings editor).
  function update(settings: GrassSettings) {
    uniforms.uGrassLight.value.set(settings.colorLight);
    uniforms.uGrassDark.value.set(settings.colorDark);
    uniforms.uStripeSoftness.value = settings.stripeSoftness;
    uniforms.uStripeRagged.value = settings.stripeRagged;
    uniforms.uCrossStripeWidth.value = settings.crossStripeWidth;
    uniforms.uCrossStripeOpacity.value = settings.crossStripeOpacity;
    uniforms.uTile.value.set(settings.textureTileSize, settings.textureTileSize * settings.textureStretch);
    uniforms.uTextureStrength.value = settings.textureStrength;
    uniforms.uNormalStrength.value = settings.normalStrength;
    uniforms.uPatchStrength.value = settings.patchStrength;
    uniforms.uPatchSize.value = settings.patchSize;
    uniforms.uAngleShading.value = settings.angleShading;
    uniforms.uLineColor.value.set(settings.lineColor);
    uniforms.uLineRagged.value = settings.lineRagged;
    uniforms.uLineWobble.value = settings.lineWobble;
    uniforms.uLineTexture.value = settings.lineTexture;
    uniforms.uLineGrassTint.value = settings.lineGrassTint;
  }
  update(s);

  // Start from the model's light grass so roughness and the sun's sheen stay as in Blender.
  const material = stripes.light.clone() as THREE.MeshStandardMaterial;
  material.name = 'M_Grass_Shader';
  material.color.set(0xffffff);
  material.map = null;
  material.normalMap = null;
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
      .replace('#include <map_fragment>', `#include <map_fragment>\n${GRASS_COLOR}`)
      .replace('#include <normal_fragment_maps>', GRASS_NORMAL);
  };
  material.addEventListener('dispose', () => {
    textures.albedo.dispose();
    textures.normal.dispose();
    paint.dispose();
  });

  for (const old of [stripes.light, stripes.dark]) {
    for (const value of Object.values(old)) if (value instanceof THREE.Texture) value.dispose();
    old.dispose();
  }
  for (const mesh of stripes.meshes) mesh.material = material;
  /** Turns the grass texture's blades to stand up as seen from `position` (kept up to date: pass the camera's rest spot). */
  function lookFrom(position: THREE.Vector3) {
    uniforms.uViewFrom.value = position;
  }
  return { material, update, lookFrom };
}

const GRASS_PARS = /* glsl */ `
varying vec3 vGrassWorld;
uniform vec3 uGrassLight;
uniform vec3 uGrassDark;
uniform vec2 uStripes[MAX_STRIPES];
uniform int uStripeCount;
uniform float uStripeSoftness;
uniform float uStripeRagged;
uniform float uCrossStripeWidth;
uniform float uCrossStripeOpacity;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform vec2 uTile;
uniform vec3 uViewFrom;
uniform float uTextureStrength;
uniform float uNormalStrength;
uniform float uPatchStrength;
uniform float uPatchSize;
uniform float uAngleShading;
uniform sampler2D uPaint;
uniform vec2 uPaintCorner;
uniform vec2 uPaintSize;
uniform vec3 uLineColor;
uniform float uLineRagged;
uniform float uLineWobble;
uniform float uLineTexture;
uniform float uLineGrassTint;

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

// Copies of the texture tile sit on a grid of triangles (GRASS_CELL metres apart),
// each turned so its blades stand up as seen from the camera's usual spot: the
// texture was made for looking straight at it, so without turning, the blades at the
// sides of the screen lean over and smear. A copy is also shifted and maybe mirrored
// at random, which hides the repeat. Gives its colour and its slope (the normal
// map's tilt) in the pitch's directions. Passing turned versions of the original
// derivatives keeps the mipmaps seamless across the copies.
const float GRASS_CELL = 1.2;

void grassTile(vec2 xz, vec2 dx, vec2 dy, vec2 corner, out vec3 albedo, out vec2 slope, out float shade) {
  vec2 at = vec2(corner.x + 0.5 * corner.y, 0.8660254 * corner.y) * GRASS_CELL;
  vec2 away = at - uViewFrom.xz;
  away = dot(away, away) > 1e-4 ? normalize(away) : vec2(0.0, -1.0);
  vec2 across = vec2(-away.y, away.x);
  mat2 turn = mat2(across.x, away.x, across.y, away.y); // pitch (x, z) to (across, away from the camera)
  vec2 flip = vec2(grassHash(corner + 3.1) < 0.5 ? -1.0 : 1.0, 1.0);
  vec2 shift = vec2(grassHash(corner + 7.7), grassHash(corner + 13.3));
  vec2 scale = flip / uTile;
  vec2 st = (turn * (xz - at)) * scale + shift;
  vec2 sdx = (turn * dx) * scale;
  vec2 sdy = (turn * dy) * scale;
  albedo = textureGrad(uAlbedo, st, sdx, sdy).rgb;
  vec3 n = textureGrad(uNormal, st, sdx, sdy).xyz * 2.0 - 1.0;
  vec2 s = flip * (n.xy / max(n.z, 0.25));
  s.y /= max(uTile.y / uTile.x, 1e-3); // undo the stretch away from the camera
  vec2 g = across * s.x + away * s.y;  // turned back to the pitch's (x, z)
  slope = vec2(g.x, -g.y);             // x to the right, y toward the goal
  shade = dot(albedo, vec3(0.333));
}

// The texture: the three copies around this point, blended. Where they overlap, the
// brighter blades win, so the blend keeps the grass crisp instead of washing it out.
void grassTexture(vec2 xz, out vec3 albedo, out vec2 slope) {
  vec2 dx = dFdx(xz);
  vec2 dy = dFdy(xz);
  vec2 p = xz / GRASS_CELL;
  vec2 skew = vec2(p.x - 0.57735027 * p.y, 1.15470054 * p.y); // triangle grid -> square grid
  vec2 base = floor(skew);
  vec2 f = fract(skew);
  float upper = step(1.0, f.x + f.y);
  vec3 w = upper > 0.5 ? vec3(f.x + f.y - 1.0, 1.0 - f.y, 1.0 - f.x) : vec3(1.0 - f.x - f.y, f.x, f.y);
  vec3 a1, a2, a3;
  vec2 s1, s2, s3;
  float l1, l2, l3;
  grassTile(xz, dx, dy, base + vec2(upper), a1, s1, l1);
  grassTile(xz, dx, dy, base + vec2(1.0, 0.0), a2, s2, l2);
  grassTile(xz, dx, dy, base + vec2(0.0, 1.0), a3, s3, l3);
  w = pow(w * mix(vec3(1.0), vec3(l1, l2, l3), 0.6), vec3(7.0));
  w /= max(w.x + w.y + w.z, 1e-6);
  albedo = a1 * w.x + a2 * w.y + a3 * w.z;
  slope = s1 * w.x + s2 * w.y + s3 * w.z;
}
`;

const GRASS_COLOR = /* glsl */ `
  vec2 grassUv = vec2(vGrassWorld.x, -vGrassWorld.z) / uTile; // u to the right, v toward the goal
  vec3 grassAlbedo;
  vec2 grassSlope;
  grassTexture(vGrassWorld.xz, grassAlbedo, grassSlope);

  // How small the texture is on screen: 0 where a 256-pixel copy of the tile
  // would show one texture pixel per screen pixel, +1 for each halving. Where the
  // blades get smaller than a pixel, the bumps and the ragged edges fade out, so
  // the grass doesn't sparkle when the camera moves.
  vec2 grassFootprint = max(abs(dFdx(grassUv)), abs(dFdy(grassUv)));
  float grassLod = log2(max(max(grassFootprint.x, grassFootprint.y) * 256.0, 1e-4));
  float grassNear = 1.0 - smoothstep(2.0, 4.0, grassLod);

  // The texture's variation around its own average colour (its 1 x 1 mipmap).
  vec3 grassMean = textureLod(uAlbedo, vec2(0.5), 16.0).rgb;
  vec3 grassDetail = mix(vec3(1.0), grassAlbedo / max(grassMean, vec3(1e-3)), uTextureStrength);

  // Thin streaks, each about as wide as a blade and much longer toward the goal,
  // so on screen they stand up like blades. They break up the stripe and paint
  // edges. Where a streak gets thinner than a pixel they fade out.
  vec2 grassXZ = vGrassWorld.xz;
  float grassEdgeNear = 1.0 - smoothstep(0.003, 0.012, fwidth(grassXZ.x));
  vec2 grassBlades = vec2(
    grassNoise(grassXZ * vec2(170.0, 14.0)) + 0.5 * grassNoise(grassXZ * vec2(340.0, 29.0) + 5.0),
    grassNoise(grassXZ * vec2(150.0, 12.0) + 11.0) + 0.5 * grassNoise(grassXZ * vec2(310.0, 25.0) + 23.0)
  ) - 0.75;
  grassBlades *= grassEdgeNear;

  // Stripes: the edge wobbles gently and blades poke across it; the blend is never thinner than a pixel.
  float wobble = grassNoise(grassXZ * vec2(4.0, 7.0)) + 0.5 * grassNoise(grassXZ * vec2(11.0, 19.0) + 31.0) - 0.75;
  float stripeX = grassXZ.x + uStripeRagged * (1.4 * wobble + 2.0 * grassBlades.x);
  float stripeEdge = 0.5 * max(max(uStripeSoftness, fwidth(grassXZ.x)), 1e-4);
  float dark = 0.0;
  for (int i = 0; i < MAX_STRIPES; i++) {
    if (i >= uStripeCount) break;
    vec2 s = uStripes[i];
    dark = max(dark, smoothstep(s.x - stripeEdge, s.x + stripeEdge, stripeX) * (1.0 - smoothstep(s.y - stripeEdge, s.y + stripeEdge, stripeX)));
  }

  // Cross stripes: see-through dark stripes running left to right, laid over the
  // stripes above, counted from the goal line (z = 0). Where one crosses a light
  // stripe it turns a little darker, and over a dark stripe darker still. Far
  // away, where a stripe gets only a few pixels tall, it fades to an even mix so
  // it doesn't flicker.
  float grassCross = 0.0;
  if (uCrossStripeWidth > 0.0) {
    float wobbleZ = grassNoise(grassXZ * vec2(7.0, 4.0) + 53.0) + 0.5 * grassNoise(grassXZ * vec2(19.0, 11.0) + 71.0) - 0.75;
    float bandZ = -grassXZ.y + uStripeRagged * (1.4 * wobbleZ + 2.0 * grassBlades.y);
    float bandPos = bandZ / (2.0 * uCrossStripeWidth) + 0.25; // a cross stripe, then a gap as wide
    float bandWave = abs(fract(bandPos) * 2.0 - 1.0);         // 1 in the middle of a cross stripe, 0 in the gap
    float bandEdge = max(max(uStripeSoftness, fwidth(grassXZ.y)), 1e-4) / (2.0 * uCrossStripeWidth);
    float band = smoothstep(0.5 - bandEdge, 0.5 + bandEdge, bandWave);
    band = mix(band, 0.5, smoothstep(0.15, 0.35, bandEdge));
    grassCross = band * uCrossStripeOpacity;
  }
  // A cross stripe darkens by the same step as going from a light to a dark stripe, times its opacity.
  vec3 grass = mix(uGrassLight, uGrassDark, dark) * mix(vec3(1.0), uGrassDark / max(uGrassLight, vec3(1e-3)), grassCross);
  grass *= grassDetail;

  // Soft lighter and darker patches.
  float patches = grassNoise(grassXZ / uPatchSize) + 0.5 * grassNoise(grassXZ / (0.4 * uPatchSize) + 17.0) - 0.75;
  grass *= 1.0 + 2.0 * uPatchStrength * patches;

  // Painted lines and spot: white grass. Blades poke out of the edge up close;
  // far away, where a line is thinner than a pixel, it keeps its average coverage.
  vec2 paintUv = vec2(grassXZ.x - uPaintCorner.x, uPaintCorner.y - grassXZ.y) / uPaintSize;
  // Plus a slow wave in and out along the edges (cells of about 20 to 50 cm), big enough to stay
  // visible on the far lines, where the blades have faded out.
  vec2 paintWobble = vec2(
    grassNoise(grassXZ * vec2(3.0, 2.0) + 83.0) + 0.5 * grassNoise(grassXZ * vec2(7.0, 5.0) + 97.0),
    grassNoise(grassXZ * vec2(2.0, 3.0) + 89.0) + 0.5 * grassNoise(grassXZ * vec2(5.0, 7.0) + 101.0)
  ) - 0.75;
  paintUv += (grassBlades * uLineRagged + paintWobble * uLineWobble) / uPaintSize;
  float paintCover = texture(uPaint, paintUv).r;
  float pixelSize = max(length(dFdx(grassXZ)), length(dFdy(grassXZ)));
  float paintEdge = clamp(pixelSize / 0.08, 0.06, 0.5);
  float grassPaint = smoothstep(0.5 - paintEdge, 0.5 + paintEdge, paintCover);
  // The paint is thin: the grass's light and dark shows through it, and a little of its green.
  float paintShade = mix(1.0, dot(grassAlbedo / max(grassMean, vec3(1e-3)), vec3(0.333)), uLineTexture);
  grass = mix(grass, mix(uLineColor, grass, uLineGrassTint) * paintShade, grassPaint);

  // 0 where you look across the grass, 1 where you look down onto it. Red fades
  // a little faster, so close grass looks deeper green; dark stripes lose a
  // little more, so the stripes stand out more in front of you.
  float down = smoothstep(0.0, 0.35, normalize(cameraPosition - vGrassWorld).y);
  grass *= pow(vec3(max(1.0 - uAngleShading * down, 0.0)), vec3(1.2, 1.0, 1.0) * (1.0 + 0.85 * (dark + grassCross) * (1.0 - grassPaint)));

  diffuseColor.rgb *= max(grass, vec3(0.0));
`;

// The grass's bumps, from the normal map, as the light sees them.
const GRASS_NORMAL = /* glsl */ `
  {
    // Paint fills the gaps between the blades a little, so painted grass is smoother.
    vec2 slope = grassSlope * uNormalStrength * grassNear * (1.0 - 0.7 * grassPaint);
    vec3 bumpy = normalize(vec3(slope.x, 1.0, -slope.y)); // u is +x, v is -z, up is +y
    normal = normalize((viewMatrix * vec4(bumpy, 0.0)).xyz);
  }
`;

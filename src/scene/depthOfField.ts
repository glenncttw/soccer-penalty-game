import * as THREE from 'three';
import { DEPTH_OF_FIELD_SETTINGS, type DepthOfFieldSettings } from './depthOfFieldSettings';

/** How many spots the lens blur reads per pixel: more is smoother and slower. */
export const BOKEH_SAMPLES = 24;

/**
 * What the sky, trees and floodlights write as their alpha to stay sharp (see keepSharp).
 * Everything else draws with alpha 1 and gets soft with distance.
 */
export const SHARP_MARK = 0;

/**
 * Where the lens blur reads round a pixel: spread evenly over a disc of radius 1 (a sunflower
 * pattern), so the blur is round like a real lens's.
 */
export function bokehPattern(count: number): THREE.Vector2[] {
  const turn = Math.PI * (3 - Math.sqrt(5)); // the golden angle
  return Array.from({ length: count }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / count);
    return new THREE.Vector2(Math.cos(i * turn) * r, Math.sin(i * turn) * r);
  });
}

/** 0..1: how soft something this many metres from the camera gets (0 = sharp). */
export function softnessAt(distance: number, sharpUntil: number, fadeDistance: number): number {
  return THREE.MathUtils.clamp((distance - sharpUntil) / Math.max(fadeDistance, 1e-3), 0, 1);
}

/**
 * Keeps the meshes under `root` whose name (or a parent's) starts with one of `prefixes` sharp,
 * however far away they are: their materials get a copy that writes SHARP_MARK as its alpha into
 * the game's picture (solid things draw without blending, so it lands as it is).
 */
export function keepSharp(root: THREE.Object3D, prefixes: string[]) {
  const named = (o: THREE.Object3D | null): boolean =>
    !!o && (prefixes.some((p) => o.name.startsWith(p)) || named(o.parent));
  const copies = new Map<THREE.Material, THREE.Material>();
  const sharpCopy = (m: THREE.Material) => {
    if (!copies.has(m)) {
      const copy = m.clone();
      copy.onBeforeCompile = (shader, renderer) => {
        m.onBeforeCompile(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          gl_FragColor.a = ${SHARP_MARK.toFixed(1)};`,
        );
      };
      copy.customProgramCacheKey = () => `${m.customProgramCacheKey()}|keepSharp`;
      copies.set(m, copy);
    }
    return copies.get(m)!;
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !named(o)) return;
    o.material = Array.isArray(o.material) ? o.material.map(sharpCopy) : sharpCopy(o.material);
  });
}

const FULL_SCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// How far from the camera each pixel is, from the depth picture.
const DISTANCE = /* glsl */ `
  #include <packing>
  uniform sampler2D uDepth;
  uniform float uNear, uFar;
  float distanceAt(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(uDepth, uv).x, uNear, uFar);
  }
`;

// A half-size copy of the picture with how soft each pixel gets in alpha (the same as softnessAt).
const PREPARE_FRAGMENT = /* glsl */ `
  uniform sampler2D uPicture;
  uniform float uSharpUntil, uFade;
  varying vec2 vUv;
  ${DISTANCE}
  void main() {
    vec4 picture = texture2D(uPicture, vUv);
    float soft = clamp((distanceAt(vUv) - uSharpUntil) / uFade, 0.0, 1.0);
    gl_FragColor = vec4(picture.rgb, picture.a * soft); // the sky, trees and floodlights wrote 0 as their alpha
  }
`;

// The lens blur: each pixel gathers the spots round it whose own blur reaches it, so soft things
// spill softly onto what's round them, but never onto things in front of them (the goal, the
// barriers), and sharp things never smear.
const BOKEH_FRAGMENT = /* glsl */ `
  uniform sampler2D uPrepared;
  uniform vec2 uRadius; // the widest blur's radius, in the picture's 0..1 units across and up
  uniform float uRadiusPixels; // the same, in the half-size picture's pixels
  uniform vec2 uPattern[${BOKEH_SAMPLES}];
  varying vec2 vUv;
  ${DISTANCE}
  void main() {
    vec4 middle = texture2D(uPrepared, vUv);
    float here = distanceAt(vUv);
    vec3 sum = vec3(0.0);
    float weight = 0.0;
    for (int i = 0; i < ${BOKEH_SAMPLES}; i++) {
      vec2 at = vUv + uPattern[i] * uRadius;
      vec4 s = texture2D(uPrepared, at);
      float away = length(uPattern[i]) * uRadiusPixels;
      float w = smoothstep(away - 1.0, away + 0.5, s.a * uRadiusPixels); // its own blur reaches here
      w *= 1.0 - smoothstep(0.2, 0.6, distanceAt(at) - here); // and it isn't behind what's here
      sum += s.rgb * w;
      weight += w;
    }
    float own = middle.a > 0.0 ? 1.0 : 1e-4;
    vec3 color = (middle.rgb * own + sum) / (own + weight);
    // How much of the blurred copy to show: all of it where things are soft, less the further outside.
    float show = max(clamp(middle.a * uRadiusPixels, 0.0, 1.0), weight / ${BOKEH_SAMPLES.toFixed(1)});
    gl_FragColor = vec4(color, show);
  }
`;

const MIX_FRAGMENT = /* glsl */ `
  uniform sampler2D uSharp;
  uniform sampler2D uSoft;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vec3 sharp = texture2D(uSharp, vUv).rgb;
    vec4 soft = texture2D(uSoft, vUv);
    gl_FragColor = vec4(mix(sharp, soft.rgb, uStrength * soft.a), 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Draws the game like a camera focused on the goal (see depthOfFieldSettings.ts): the picture and
 * how far away each pixel is are drawn first; a half-size copy is blurred like a lens, more the
 * further behind the goal things are, and the two are mixed on screen. Everything up to just
 * behind the goal, and the sky, trees and floodlights (see keepSharp), stays exactly as sharp as before.
 */
export class DepthOfField {
  private readonly sharp = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private readonly prepared: THREE.WebGLRenderTarget;
  private readonly soft: THREE.WebGLRenderTarget;
  private readonly screen = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly prepare: THREE.ShaderMaterial;
  private readonly bokeh: THREE.ShaderMaterial;
  private readonly mix: THREE.ShaderMaterial;
  private readonly depth = {
    uDepth: { value: null as THREE.Texture | null },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
  };
  private settings: DepthOfFieldSettings;

  /** `goal` is a point on the goal line: things start to get soft a bit behind it. */
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly goal: THREE.Vector3,
    s: DepthOfFieldSettings = DEPTH_OF_FIELD_SETTINGS,
  ) {
    this.sharp.texture.colorSpace = THREE.SRGBColorSpace;
    this.sharp.depthTexture = new THREE.DepthTexture(1, 1);
    this.depth.uDepth.value = this.sharp.depthTexture;
    const half = { type: THREE.HalfFloatType, depthBuffer: false };
    this.prepared = new THREE.WebGLRenderTarget(1, 1, half);
    this.soft = new THREE.WebGLRenderTarget(1, 1, half);
    const shader = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: FULL_SCREEN_VERTEX,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
      });
    this.prepare = shader(PREPARE_FRAGMENT, {
      ...this.depth,
      uPicture: { value: this.sharp.texture },
      uSharpUntil: { value: 0 },
      uFade: { value: 1 },
    });
    this.bokeh = shader(BOKEH_FRAGMENT, {
      ...this.depth,
      uPrepared: { value: this.prepared.texture },
      uRadius: { value: new THREE.Vector2() },
      uRadiusPixels: { value: 0 },
      uPattern: { value: bokehPattern(BOKEH_SAMPLES) },
    });
    this.mix = shader(MIX_FRAGMENT, {
      uSharp: { value: this.sharp.texture },
      uSoft: { value: this.soft.texture },
      uStrength: { value: 0 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mix);
    this.quad.frustumCulled = false;
    this.settings = s;
    this.update(s);
  }

  update(s: DepthOfFieldSettings) {
    this.settings = s;
    this.prepare.uniforms.uFade.value = Math.max(s.fadeDistance, 1e-3);
  }

  /** The picture the game is drawn into before it goes on screen. */
  get picture(): THREE.WebGLRenderTarget {
    return this.sharp;
  }

  /** Call when the drawing size changes (in drawn pixels). */
  setSize(width: number, height: number) {
    this.sharp.setSize(width, height);
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    this.prepared.setSize(w, h);
    this.soft.setSize(w, h);
  }

  /** Draws the game and puts it on screen with what's far behind the goal out of focus. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const { renderer, settings: s } = this;
    renderer.setRenderTarget(this.sharp);
    renderer.render(scene, camera);
    if (!s.depthOfField || s.blur <= 0) return this.show();

    this.depth.uNear.value = camera.near;
    this.depth.uFar.value = camera.far;
    this.prepare.uniforms.uSharpUntil.value = camera.position.distanceTo(this.goal) + s.sharpBehindGoal;
    // The widest blur's radius: half its width, in the half-size pictures' pixels and 0..1 units.
    const radiusPixels = (s.blur * this.soft.height) / 2;
    this.bokeh.uniforms.uRadius.value.set(radiusPixels / this.soft.width, radiusPixels / this.soft.height);
    this.bokeh.uniforms.uRadiusPixels.value = radiusPixels;
    this.pass(this.prepare, this.prepared);
    this.pass(this.bokeh, this.soft);
    this.show(1);
  }

  /** Puts `picture` on screen, mixed with its blurred copy by `strength` (0: just as it is). */
  show(strength = 0) {
    this.mix.uniforms.uStrength.value = strength;
    this.pass(this.mix, null);
  }

  private pass(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.quad, this.screen);
  }
}

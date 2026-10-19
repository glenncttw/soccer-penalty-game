import * as THREE from 'three';
import { DEPTH_OF_FIELD_SETTINGS, type DepthOfFieldSettings } from './depthOfFieldSettings';

/** How many spots the lens blur reads per pixel: more is smoother and slower. */
export const BOKEH_SAMPLES = 24;

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

const FULL_SCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Reads the distance from the depth picture and works out how soft each pixel is (the same as softnessAt).
const SOFTNESS = /* glsl */ `
  #include <packing>
  uniform sampler2D uDepth;
  uniform float uNear, uFar, uSharpUntil, uFade;
  float softnessAt(vec2 uv) {
    float distance = -perspectiveDepthToViewZ(texture2D(uDepth, uv).x, uNear, uFar);
    return clamp((distance - uSharpUntil) / uFade, 0.0, 1.0);
  }
`;

// A half-size copy of the picture with each pixel's softness in alpha; bright spots made brighter, like a lens.
const PREPARE_FRAGMENT = /* glsl */ `
  uniform sampler2D uPicture;
  uniform float uHighlights;
  varying vec2 vUv;
  ${SOFTNESS}
  void main() {
    vec3 color = texture2D(uPicture, vUv).rgb;
    float soft = softnessAt(vUv);
    float bright = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color *= 1.0 + uHighlights * soft * 3.0 * smoothstep(0.6, 1.0, bright);
    gl_FragColor = vec4(color, soft);
  }
`;

// The lens blur: each pixel gathers the spots round it whose own blur reaches it, so sharp things
// (the goal, the keeper) don't smear into the soft background behind them.
const BOKEH_FRAGMENT = /* glsl */ `
  uniform sampler2D uPrepared;
  uniform vec2 uRadius; // the widest blur's radius, in the picture's 0..1 units across and up
  uniform float uRadiusPixels; // the same, in the half-size picture's pixels
  uniform vec2 uPattern[${BOKEH_SAMPLES}];
  varying vec2 vUv;
  void main() {
    vec4 middle = texture2D(uPrepared, vUv);
    vec3 sum = middle.rgb;
    float weight = 1.0;
    for (int i = 0; i < ${BOKEH_SAMPLES}; i++) {
      vec4 s = texture2D(uPrepared, vUv + uPattern[i] * uRadius);
      float reach = s.a * uRadiusPixels; // how far this spot's own blur spreads
      float away = length(uPattern[i]) * uRadiusPixels;
      float w = smoothstep(away - 1.0, away + 0.5, min(reach, middle.a * uRadiusPixels + 1.0));
      sum += s.rgb * w;
      weight += w;
    }
    gl_FragColor = vec4(sum / weight, middle.a);
  }
`;

const MIX_FRAGMENT = /* glsl */ `
  uniform sampler2D uSharp;
  uniform sampler2D uSoft;
  uniform float uStrength;
  uniform float uRadiusPixels;
  varying vec2 vUv;
  ${SOFTNESS}
  void main() {
    vec4 sharp = texture2D(uSharp, vUv);
    // Fade to the blurred picture once the blur is about a pixel wide.
    float soft = uStrength * clamp(softnessAt(vUv) * uRadiusPixels, 0.0, 1.0);
    gl_FragColor = vec4(mix(sharp.rgb, texture2D(uSoft, vUv).rgb, soft), 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Draws the game with depth of field (see depthOfFieldSettings.ts): the picture and how far away
 * each pixel is are drawn first, a half-size copy is blurred like a lens (more the further away),
 * and the two are mixed on screen. Everything up to just behind the goal stays as sharp as before.
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
    uSharpUntil: { value: 0 },
    uFade: { value: 1 },
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
    const radius = { uRadius: { value: new THREE.Vector2() }, uRadiusPixels: { value: 0 } };
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
      uHighlights: { value: 0 },
    });
    this.bokeh = shader(BOKEH_FRAGMENT, {
      ...radius,
      uPrepared: { value: this.prepared.texture },
      uPattern: { value: bokehPattern(BOKEH_SAMPLES) },
    });
    this.mix = shader(MIX_FRAGMENT, {
      ...this.depth,
      uRadiusPixels: radius.uRadiusPixels,
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
    this.prepare.uniforms.uHighlights.value = s.highlights;
    this.depth.uFade.value = Math.max(s.fadeDistance, 1e-3);
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

  /** Draws the game and puts it on screen with the depth of field. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const { renderer, settings: s } = this;
    renderer.setRenderTarget(this.sharp);
    renderer.render(scene, camera);
    if (!s.depthOfField || s.blur <= 0) return this.show();

    this.depth.uNear.value = camera.near;
    this.depth.uFar.value = camera.far;
    this.depth.uSharpUntil.value = camera.position.distanceTo(this.goal) + s.sharpBehindGoal;
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

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { RenderSettings, ToneMappingMode } from './renderSettings';

/** three.js's own tone mapping curves (from its tonemapping_pars_fragment chunk), so they match the docs exactly. */
const TONE_MAPPING_FUNCTIONS: Record<ToneMappingMode, string> = {
  none: 'LinearToneMapping', // exposure, then cut off at white
  neutral: 'NeutralToneMapping',
  aces: 'ACESFilmicToneMapping',
  agx: 'AgXToneMapping',
};

/** The glow is built from this many ever smaller copies of the bright parts: 1/2 down to 1/32 of the screen. */
const BLOOM_LEVELS = 5;
const BLUR_LEVELS = 2; // depth of field: 1/2 and 1/4

/**
 * The exposure of the finishing pass, as a uniform to share. The sky's colours are set as final
 * screen colours, so it divides by this: exposure brightens the stadium, not the sky.
 */
export const EXPOSURE = { value: 1 };

/** Optional timing hooks, used by the dev-only rendering panel. */
export interface RenderProfiler {
  begin(stage: string): void;
  end(): void;
}

/** One render target, for the memory figures in the rendering panel. */
export interface TargetStats {
  name: string;
  width: number;
  height: number;
  bytes: number;
}

interface HdrFormat {
  type: THREE.TextureDataType;
  format: THREE.PixelFormat;
  bytesPerPixel: number;
  maxSamples: number;
  name: string;
}

/**
 * Draws the scene into a floating-point picture (so light brighter than white survives), then
 * finishes it for the screen in a single pass: glow, tone mapping, colour grading and dithering.
 * Tone mapping and the sRGB conversion happen there and nowhere else, so the renderer's own tone
 * mapping stays off. Edges are smoothed with MSAA while the scene is drawn.
 *
 * The optional effects only cost something when they're on: the glow adds 9 small passes,
 * depth of field 2 more, and the haze is the scene's fog, which costs nothing extra.
 */
export class RenderPipeline {
  /** A point (in world space) up to which everything stays sharp when depth of field is on: the back of the net. */
  readonly sharpUntil = new THREE.Vector3();
  profiler: RenderProfiler | null = null;

  private settings: RenderSettings;
  private readonly format: HdrFormat;
  private readonly blurFormat: HdrFormat;
  private scene: THREE.WebGLRenderTarget;
  private readonly bloom: THREE.WebGLRenderTarget[] = [];
  private readonly blur: THREE.WebGLRenderTarget[] = [];
  private readonly quad = new FullScreenQuad();
  private readonly downsample: THREE.ShaderMaterial;
  private readonly prefilter: THREE.ShaderMaterial;
  private readonly upsample: THREE.ShaderMaterial;
  private readonly blurDownsample: THREE.ShaderMaterial;
  private readonly circleOfConfusion: THREE.ShaderMaterial;
  private readonly finish: THREE.ShaderMaterial;
  private readonly fog = new THREE.Fog(0xffffff);
  private readonly bufferSize = new THREE.Vector2();
  private cssWidth = 1;
  private cssHeight = 1;
  private readonly focusPoint = new THREE.Vector3();
  private sceneCalls = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly world: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    settings: RenderSettings,
  ) {
    this.settings = settings;
    renderer.toneMapping = THREE.NoToneMapping; // the finishing pass tone maps, once
    renderer.info.autoReset = false; // count every pass of a frame, not only the last
    this.format = chooseHdrFormat(renderer, false);
    this.blurFormat = chooseHdrFormat(renderer, true); // needs alpha
    this.scene = this.createSceneTarget();
    for (let i = 0; i < BLOOM_LEVELS; i++) this.bloom.push(target(this.format));
    for (let i = 0; i < BLUR_LEVELS; i++) this.blur.push(target(this.blurFormat));

    this.downsample = pass(DOWNSAMPLE, { tSource: null, texel: new THREE.Vector2() });
    this.prefilter = pass(DOWNSAMPLE, { tSource: null, texel: new THREE.Vector2(), threshold: 1, knee: 0.5 }, { PREFILTER: '' });
    this.upsample = pass(UPSAMPLE, { tSource: null, texel: new THREE.Vector2(), weight: 1 });
    this.upsample.blending = THREE.CustomBlending; // add onto the level below
    this.upsample.blendSrc = THREE.OneFactor;
    this.upsample.blendDst = THREE.OneFactor;
    this.blurDownsample = pass(DOWNSAMPLE, { tSource: null, texel: new THREE.Vector2() });
    const focus = { tDepth: null, cameraNear: 0.1, cameraFar: 100, focusDepth: 20, focusRange: 10 };
    this.circleOfConfusion = pass(CIRCLE_OF_CONFUSION, { tSource: null, texel: new THREE.Vector2(), ...focus });
    this.finish = pass(FINISH, {
      tScene: null,
      tBloom: null,
      bloomStrength: 0,
      tBlurNear: null,
      tBlurFar: null,
      dofStrength: 0,
      ...focus,
      whiteBalance: new THREE.Vector3(1, 1, 1),
      saturation: 1,
      contrast: 1,
      shadowLift: new THREE.Vector3(),
      grain: 0,
      grainSeed: 0,
    });
    this.setSettings(settings);
  }

  get current(): RenderSettings {
    return this.settings;
  }

  /** Changes the look. Cheap, except switching tone mapping or an effect on or off, which rebuilds a shader once. */
  setSettings(settings: RenderSettings) {
    const before = this.settings;
    this.settings = { ...settings };
    const s = this.settings;
    this.renderer.toneMappingExposure = s.exposure; // used by three's tone mapping functions in the finishing pass
    EXPOSURE.value = s.exposure;

    const defines: Record<string, string> = { TONE_MAP: TONE_MAPPING_FUNCTIONS[s.toneMapping] };
    if (s.bloom) defines.BLOOM = '';
    if (s.depthOfField) defines.DEPTH_OF_FIELD = '';
    if (s.dithering) defines.DITHERING = '';
    if (s.grain > 0) defines.GRAIN = '';
    if (JSON.stringify(defines) !== JSON.stringify(this.finish.defines)) {
      this.finish.defines = defines;
      this.finish.needsUpdate = true;
    }

    const u = this.finish.uniforms;
    u.whiteBalance.value.copy(whiteBalance(s.warmth));
    u.saturation.value = s.saturation;
    u.contrast.value = s.contrast;
    const tint = new THREE.Color(s.shadowTint).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    u.shadowLift.value.set(tint.r, tint.g, tint.b).multiplyScalar(s.shadowLift);
    u.dofStrength.value = s.depthOfFieldStrength;
    u.grain.value = s.grain;
    this.prefilter.uniforms.threshold.value = s.bloomThreshold;
    this.prefilter.uniforms.knee.value = s.bloomThreshold * 0.5;

    if (s.atmosphere > 0) {
      this.fog.color.set(s.atmosphereColor);
      this.fog.near = s.atmosphereStart;
      this.fog.far = fogFarFor(s.atmosphereStart, s.atmosphereEnd, s.atmosphere);
      this.world.fog = this.fog;
    } else {
      this.world.fog = null;
    }

    const rebuild = s.antialiasSamples !== before.antialiasSamples || s.depthOfField !== before.depthOfField;
    if (rebuild) {
      this.scene.dispose();
      this.scene = this.createSceneTarget();
    }
    if (rebuild || s.maxPixelRatio !== before.maxPixelRatio) this.setSize(this.cssWidth, this.cssHeight);
  }

  /** Call when the window changes size, with its size in CSS pixels. */
  setSize(width: number, height: number) {
    this.cssWidth = width;
    this.cssHeight = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    const { x, y } = this.renderer.getDrawingBufferSize(this.bufferSize);
    this.scene.setSize(x, y);
    // The glow and blur are sized from CSS pixels, so they look the same on every screen.
    const levels = halvedSizes(width, height, BLOOM_LEVELS);
    levels.forEach(([w, h], i) => this.bloom[i].setSize(w, h));
    levels.slice(0, BLUR_LEVELS).forEach(([w, h], i) => this.blur[i].setSize(w, h));
  }

  render() {
    const r = this.renderer;
    const s = this.settings;
    r.info.reset();
    this.profiler?.begin('scene');
    r.setRenderTarget(this.scene);
    r.render(this.world, this.camera);
    this.sceneCalls = r.info.render.calls;
    const autoClear = r.autoClear;
    r.autoClear = false; // every pass below covers its whole target

    if (s.bloom) {
      this.profiler?.begin('bloom');
      this.renderBloom();
    }
    if (s.depthOfField) {
      this.profiler?.begin('depth of field');
      this.renderBlur();
    }

    this.profiler?.begin('finish');
    const u = this.finish.uniforms;
    u.tScene.value = this.scene.texture;
    u.tBloom.value = this.bloom[0].texture;
    u.grainSeed.value = (u.grainSeed.value + 17.3) % 1000;
    r.setRenderTarget(null);
    this.draw(this.finish);
    this.profiler?.end();
    r.autoClear = autoClear;
  }

  /** What the pipeline holds in GPU memory right now, for the rendering panel. */
  stats() {
    const s = this.scene;
    const samples = s.samples;
    const pixels = s.width * s.height;
    const targets: TargetStats[] = [
      { name: `scene (${this.format.name}, MSAA ${samples}x)`, width: s.width, height: s.height, bytes: pixels * (this.format.bytesPerPixel + 4) * Math.max(1, samples) },
    ];
    if (samples > 0) targets.push({ name: 'scene, smoothed', width: s.width, height: s.height, bytes: pixels * (this.format.bytesPerPixel + 4) });
    if (this.settings.bloom) for (const t of this.bloom) targets.push(stat('glow', t, this.format.bytesPerPixel));
    if (this.settings.depthOfField) for (const t of this.blur) targets.push(stat('blur', t, this.blurFormat.bytesPerPixel));
    const passes = 2 + (this.settings.bloom ? 2 * BLOOM_LEVELS - 1 : 0) + (this.settings.depthOfField ? BLUR_LEVELS : 0);
    const bytes = targets.reduce((sum, t) => sum + t.bytes, 0);
    return { format: this.format.name, targets, bytes, passes, samples, sceneCalls: this.sceneCalls };
  }

  dispose() {
    for (const t of [this.scene, ...this.bloom, ...this.blur]) t.dispose();
    for (const m of [this.downsample, this.prefilter, this.upsample, this.blurDownsample, this.circleOfConfusion, this.finish]) m.dispose();
    this.quad.dispose();
    this.world.fog = null;
  }

  private createSceneTarget() {
    const samples = Math.min(this.settings.antialiasSamples, this.format.maxSamples);
    const t = target(this.format, {
      samples,
      depthBuffer: true,
      // Depth is only needed after drawing for depth of field.
      resolveDepthBuffer: this.settings.depthOfField,
      storeMultisampledColorBuffer: false,
      storeMultisampledDepthBuffer: false,
    });
    if (this.settings.depthOfField) t.depthTexture = new THREE.DepthTexture(1, 1);
    return t;
  }

  private renderBloom() {
    // Down: keep only what's brighter than the threshold, then halve it again and again.
    let source: THREE.WebGLRenderTarget = this.scene;
    this.bloom.forEach((level, i) => {
      const m = i === 0 ? this.prefilter : this.downsample;
      this.downsampleInto(m, source, level);
      source = level;
    });
    // Up: add each blurrier level onto the sharper one above it. Radius sets how much of the wide levels shows.
    const radius = this.settings.bloomRadius;
    this.upsample.uniforms.weight.value = radius;
    if (radius > 0) {
      for (let i = BLOOM_LEVELS - 1; i > 0; i--) {
        const lower = this.bloom[i];
        this.upsample.uniforms.tSource.value = lower.texture;
        this.upsample.uniforms.texel.value.set(1 / lower.width, 1 / lower.height);
        this.renderer.setRenderTarget(this.bloom[i - 1]);
        this.draw(this.upsample);
      }
    }
    // Each level was added with weight radius^level; dividing by the total keeps the brightness the same for any radius.
    let total = 0;
    for (let i = 0; i < BLOOM_LEVELS; i++) total += radius ** i;
    this.finish.uniforms.bloomStrength.value = this.settings.bloomStrength / total;
  }

  private renderBlur() {
    this.updateFocus(this.circleOfConfusion);
    this.circleOfConfusion.uniforms.tDepth.value = this.scene.depthTexture;
    this.downsampleInto(this.circleOfConfusion, this.scene, this.blur[0]);
    this.downsampleInto(this.blurDownsample, this.blur[0], this.blur[1]);
    const u = this.finish.uniforms;
    this.updateFocus(this.finish);
    u.tDepth.value = this.scene.depthTexture;
    u.tBlurNear.value = this.blur[0].texture;
    u.tBlurFar.value = this.blur[1].texture;
  }

  /** Depth of field: everything up to the sharp point stays sharp, then the blur builds up over the range. */
  private updateFocus(material: THREE.ShaderMaterial) {
    const u = material.uniforms;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    u.focusDepth.value = -this.focusPoint.copy(this.sharpUntil).applyMatrix4(this.camera.matrixWorldInverse).z;
    u.focusRange.value = Math.max(0.1, this.settings.depthOfFieldRange);
  }

  private downsampleInto(material: THREE.ShaderMaterial, source: THREE.WebGLRenderTarget, dest: THREE.WebGLRenderTarget) {
    material.uniforms.tSource.value = source.texture;
    // Taps one source pixel apart for a halving; further apart when the source is bigger (high-DPI screens).
    const spread = Math.max(1, source.width / (2 * dest.width));
    material.uniforms.texel.value.set(spread / source.width, spread / source.height);
    this.renderer.setRenderTarget(dest);
    this.draw(material);
  }

  private draw(material: THREE.ShaderMaterial) {
    this.quad.material = material;
    this.quad.render(this.renderer);
  }
}

/**
 * The fog's far distance that makes three.js's fog (a smoothstep from near to far) reach `amount`
 * at `end`, so the haze can be set by how strong it is at a distance instead of where it's total.
 */
export function fogFarFor(start: number, end: number, amount: number): number {
  const a = THREE.MathUtils.clamp(amount, 1e-4, 1);
  const t = 0.5 - Math.sin(Math.asin(1 - 2 * a) / 3); // the inverse of smoothstep
  return start + Math.max(end - start, 0.01) / t;
}

/** Sizes of `count` targets, each half the one before, starting at half of width x height. */
export function halvedSizes(width: number, height: number, count: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => [Math.max(1, Math.round(width / 2 ** (i + 1))), Math.max(1, Math.round(height / 2 ** (i + 1)))]);
}

/** A white balance multiplier: positive warmth is yellower, negative bluer; the brightness stays the same. */
export function whiteBalance(warmth: number): THREE.Vector3 {
  const wb = new THREE.Vector3(1 + warmth, 1 + 0.3 * warmth, 1 - warmth);
  return wb.divideScalar(wb.dot(LUMA));
}
const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);

/** The best floating-point format this device can draw into (or 8-bit, without HDR, if none). */
function chooseHdrFormat(renderer: THREE.WebGLRenderer, alpha: boolean): HdrFormat {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const options = [
    { type: THREE.UnsignedInt101111Type, format: THREE.RGBFormat, internal: gl.R11F_G11F_B10F, bytesPerPixel: 4, name: 'RGB 11/11/10-bit float' },
    { type: THREE.HalfFloatType, format: THREE.RGBAFormat, internal: gl.RGBA16F, bytesPerPixel: 8, name: 'RGBA 16-bit float' },
  ].filter((o) => !alpha || o.format === THREE.RGBAFormat);
  const canFloat = renderer.extensions.has('EXT_color_buffer_float');
  try {
    for (const o of canFloat ? options : []) {
      const maxSamples = renderableSamples(gl, o.internal);
      if (maxSamples !== null) return { ...o, maxSamples };
    }
  } finally {
    renderer.resetState(); // the probe used WebGL directly
  }
  return { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, bytesPerPixel: 4, maxSamples: gl.getParameter(gl.MAX_SAMPLES), name: 'RGBA 8-bit (no HDR)' };
}

/** null if the format can't be drawn into; otherwise the most MSAA samples it allows. */
function renderableSamples(gl: WebGL2RenderingContext, internalFormat: number): number | null {
  const supported = gl.getInternalformatParameter(gl.RENDERBUFFER, internalFormat, gl.SAMPLES) as Int32Array | null;
  const maxSamples = supported && supported.length > 0 ? supported[0] : 0;
  const framebuffer = gl.createFramebuffer();
  const renderbuffer = gl.createRenderbuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
  let ok = true;
  for (const samples of maxSamples > 0 ? [0, maxSamples] : [0]) {
    if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internalFormat, 4, 4);
    else gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, 4, 4);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer);
    ok &&= gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteRenderbuffer(renderbuffer);
  return ok ? maxSamples : null;
}

function target(format: HdrFormat, options: THREE.RenderTargetOptions = {}) {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: format.type,
    format: format.format,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    ...options,
  });
}

function stat(name: string, t: THREE.WebGLRenderTarget, bytesPerPixel: number): TargetStats {
  return { name, width: t.width, height: t.height, bytes: t.width * t.height * bytesPerPixel };
}

function pass(fragmentShader: string, uniforms: Record<string, unknown>, defines: Record<string, string> = {}) {
  return new THREE.ShaderMaterial({
    uniforms: Object.fromEntries(Object.entries(uniforms).map(([k, value]) => [k, { value }])),
    defines,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

/** Halves a picture with 13 overlapping taps (the Call of Duty bloom filter), which doesn't shimmer when things move. */
const DOWNSAMPLE = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 texel;
  varying vec2 vUv;

  #ifdef PREFILTER
  uniform float threshold;
  uniform float knee;
  // Keeps only what's brighter than the threshold, with a soft start so the glow doesn't pop on.
  vec4 keepBright(vec4 c) {
    float brightness = max(c.r, max(c.g, c.b));
    float soft = clamp(brightness - threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    return c * max(soft, brightness - threshold) / max(brightness, 1e-5);
  }
  // Weighs a group down by its brightness, so a single very bright pixel can't make the glow flicker.
  float karis(vec4 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
  #endif

  vec4 tap(float x, float y) { return texture2D(tSource, vUv + vec2(x, y) * texel); }

  void main() {
    vec4 a = tap(-2.0, 2.0), b = tap(0.0, 2.0), c = tap(2.0, 2.0);
    vec4 d = tap(-1.0, 1.0), e = tap(1.0, 1.0);
    vec4 f = tap(-2.0, 0.0), g = tap(0.0, 0.0), h = tap(2.0, 0.0);
    vec4 i = tap(-1.0, -1.0), j = tap(1.0, -1.0);
    vec4 k = tap(-2.0, -2.0), l = tap(0.0, -2.0), m = tap(2.0, -2.0);
    vec4 g0 = (d + e + i + j) * 0.25;
    vec4 g1 = (a + b + f + g) * 0.25;
    vec4 g2 = (b + c + g + h) * 0.25;
    vec4 g3 = (f + g + k + l) * 0.25;
    vec4 g4 = (g + h + l + m) * 0.25;
    #ifdef PREFILTER
      float w0 = karis(g0) * 0.5, w1 = karis(g1) * 0.125, w2 = karis(g2) * 0.125, w3 = karis(g3) * 0.125, w4 = karis(g4) * 0.125;
      gl_FragColor = keepBright((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4));
    #else
      gl_FragColor = g0 * 0.5 + (g1 + g2 + g3 + g4) * 0.125;
    #endif
  }`;

/** Doubles a glow level with a soft 3x3 tent filter, scaled by weight, to be added onto the level above. */
const UPSAMPLE = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 texel;
  uniform float weight;
  varying vec2 vUv;

  vec3 tap(float x, float y) { return texture2D(tSource, vUv + vec2(x, y) * texel).rgb; }

  void main() {
    vec3 sum = tap(-1.0, -1.0) + tap(1.0, -1.0) + tap(-1.0, 1.0) + tap(1.0, 1.0)
      + 2.0 * (tap(0.0, -1.0) + tap(-1.0, 0.0) + tap(1.0, 0.0) + tap(0.0, 1.0))
      + 4.0 * tap(0.0, 0.0);
    gl_FragColor = vec4(sum / 16.0 * weight, 1.0);
  }`;

/** How blurry each pixel should be: 0 up to the sharp point, rising to 1 over the range behind it. */
const FOCUS = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focusDepth;
  uniform float focusRange;
  float blurAmount(vec2 uv) {
    float depth = -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, cameraNear, cameraFar);
    return smoothstep(focusDepth, focusDepth + focusRange, depth);
  }`;

/**
 * Depth of field, first step: halves the scene, keeping only what's behind the sharp point
 * (weighted by how blurry it should be), so the sharp goal and net never smear into the blur.
 */
const CIRCLE_OF_CONFUSION = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 texel;
  varying vec2 vUv;
  ${FOCUS}

  vec4 tap(float x, float y) {
    vec2 uv = vUv + vec2(x, y) * texel;
    float w = blurAmount(uv);
    return vec4(texture2D(tSource, uv).rgb * w, w);
  }

  void main() {
    gl_FragColor = (tap(-1.0, -1.0) + tap(1.0, -1.0) + tap(-1.0, 1.0) + tap(1.0, 1.0)) * 0.25;
  }`;

/** The finishing pass: everything that turns the scene's light into the colours on screen. */
const FINISH = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec3 whiteBalance;
  uniform float saturation;
  uniform float contrast;
  uniform vec3 shadowLift;
  varying vec2 vUv;

  #include <tonemapping_pars_fragment>

  #ifdef BLOOM
  uniform sampler2D tBloom;
  uniform float bloomStrength;
  #endif

  #ifdef DEPTH_OF_FIELD
  uniform sampler2D tBlurNear;
  uniform sampler2D tBlurFar;
  uniform float dofStrength;
  ${FOCUS}
  vec3 unweigh(vec4 blur, vec3 fallback) { return blur.a > 1e-3 ? blur.rgb / blur.a : fallback; }
  #endif

  #if defined(DITHERING) || defined(GRAIN)
  uniform float grain;
  uniform float grainSeed;
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  #endif

  void main() {
    vec3 color = texture2D(tScene, vUv).rgb;

    #ifdef DEPTH_OF_FIELD
      // 0..2: from sharp, through the half-size blur, to the quarter-size blur.
      float amount = blurAmount(vUv) * dofStrength * 2.0;
      vec3 near = unweigh(texture2D(tBlurNear, vUv), color);
      vec3 far = unweigh(texture2D(tBlurFar, vUv), near);
      color = amount < 1.0 ? mix(color, near, amount) : mix(near, far, amount - 1.0);
    #endif

    #ifdef BLOOM
      color += texture2D(tBloom, vUv).rgb * bloomStrength;
    #endif

    // Exposure and tone mapping, with three.js's own curve: light becomes 0..1 screen colour.
    color = TONE_MAP(color);

    // Grading on the screen's linear light: white balance, then saturation.
    color *= whiteBalance;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = clamp(mix(vec3(luma), color, saturation), 0.0, 1.0);

    // To sRGB, as the screen expects. Contrast and the shadow lift work on these values.
    color = sRGBTransferOETF(vec4(color, 1.0)).rgb;
    // An S-curve that keeps black and white where they are (contrast 1 = unchanged).
    color = mix(color, color * color * (3.0 - 2.0 * color), contrast - 1.0);
    color += shadowLift * (1.0 - color) * (1.0 - color);

    #ifdef DITHERING
      color += (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 71.3) - 1.0) / 255.0;
    #endif
    #ifdef GRAIN
      color += (hash(gl_FragCoord.xy + grainSeed) - 0.5) * grain;
    #endif

    gl_FragColor = vec4(color, 1.0);
  }`;

import * as THREE from 'three';
import { FOCUS_SETTINGS, type FocusSettings } from './focusSettings';

/** Where the sharp area is: its middle and half its width and height, in shares of the screen's height. */
export interface SharpArea {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

/**
 * The smallest box round some points on screen (0..1 across and up), plus a margin, measured in
 * shares of the screen's height (so across is stretched by the screen's shape).
 */
export function sharpAreaAround(points: THREE.Vector2[], aspect: number, margin: number): SharpArea {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x * aspect);
    x1 = Math.max(x1, p.x * aspect);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, halfWidth: (x1 - x0) / 2 + margin, halfHeight: (y1 - y0) / 2 + margin };
}

// A 9-texel Gaussian blur read with 3 texture reads either side thanks to the texture's own smoothing.
const BLUR_OFFSETS = [0, 1.3846153846, 3.2307692308];
const BLUR_WEIGHTS = [0.227027027, 0.3162162162, 0.0702702703];
const BLUR_REACH = BLUR_OFFSETS[2];

const FULL_SCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D uPicture;
  uniform vec2 uStep; // one blur step, in the picture's 0..1 units
  varying vec2 vUv;
  void main() {
    vec4 sum = texture2D(uPicture, vUv) * ${BLUR_WEIGHTS[0]};
    sum += (texture2D(uPicture, vUv + uStep * ${BLUR_OFFSETS[1]}) + texture2D(uPicture, vUv - uStep * ${BLUR_OFFSETS[1]})) * ${BLUR_WEIGHTS[1]};
    sum += (texture2D(uPicture, vUv + uStep * ${BLUR_OFFSETS[2]}) + texture2D(uPicture, vUv - uStep * ${BLUR_OFFSETS[2]})) * ${BLUR_WEIGHTS[2]};
    gl_FragColor = sum;
    #include <colorspace_fragment>
  }
`;

const MIX_FRAGMENT = /* glsl */ `
  uniform sampler2D uSharp;
  uniform sampler2D uSoft;
  uniform float uAspect;
  uniform vec4 uArea; // middle x, y and half width, height, in shares of the screen's height
  uniform float uRoundness, uSoftness, uStrength, uTop, uSides, uBottom;
  varying vec2 vUv;
  void main() {
    vec4 sharp = texture2D(uSharp, vUv);
    vec2 p = vec2(vUv.x * uAspect, vUv.y) - uArea.xy;
    // How far outside the sharp area (a box with rounded corners) this pixel is.
    vec2 inner = max(uArea.zw - uRoundness, 0.0);
    vec2 q = abs(p) - inner;
    float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRoundness;
    float soft = smoothstep(0.0, uSoftness, outside);
    // Above, beside or below the area: each has its own amount, blended round the corners.
    vec2 off = max(q, 0.0);
    float upDown = off.y * off.y / max(dot(off, off), 1e-8);
    float amount = mix(uSides, p.y > 0.0 ? uTop : uBottom, upDown);
    gl_FragColor = mix(sharp, texture2D(uSoft, vUv), soft * amount * uStrength);
    #include <colorspace_fragment>
  }
`;

/**
 * Draws the game with a soft focus (see focusSettings.ts): the picture is drawn into a texture
 * first, a small blurred copy of it is made at half the size, and the two are mixed on screen, more
 * of the blurred one the further a pixel is from the goal and the ball. The sharp area follows them
 * on screen, so it fits a wide screen and an upright phone alike.
 */
export class SoftFocus {
  private readonly sharp = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private readonly across = new THREE.WebGLRenderTarget(1, 1);
  private readonly soft = new THREE.WebGLRenderTarget(1, 1);
  private readonly screen = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly blur: THREE.ShaderMaterial;
  private readonly mix: THREE.ShaderMaterial;
  private readonly onScreen: THREE.Vector2[];
  private readonly corner = new THREE.Vector3();
  private settings: FocusSettings;

  /**
   * `keepSharp` are the points in the world that stay in focus: the goal's corners and where the
   * ball lies.
   */
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly keepSharp: THREE.Vector3[],
    s: FocusSettings = FOCUS_SETTINGS,
  ) {
    for (const t of [this.sharp, this.across, this.soft]) {
      t.texture.colorSpace = THREE.SRGBColorSpace;
      t.texture.generateMipmaps = false;
    }
    this.onScreen = keepSharp.map(() => new THREE.Vector2());
    this.blur = new THREE.ShaderMaterial({
      uniforms: { uPicture: { value: null }, uStep: { value: new THREE.Vector2() } },
      vertexShader: FULL_SCREEN_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.mix = new THREE.ShaderMaterial({
      uniforms: {
        uSharp: { value: this.sharp.texture },
        uSoft: { value: this.soft.texture },
        uAspect: { value: 1 },
        uArea: { value: new THREE.Vector4() },
        uRoundness: { value: 0 },
        uSoftness: { value: 1 },
        uStrength: { value: 0 },
        uTop: { value: 0 },
        uSides: { value: 0 },
        uBottom: { value: 0 },
      },
      vertexShader: FULL_SCREEN_VERTEX,
      fragmentShader: MIX_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mix);
    this.quad.frustumCulled = false;
    this.settings = s;
    this.update(s);
  }

  update(s: FocusSettings) {
    this.settings = s;
    const u = this.mix.uniforms;
    u.uRoundness.value = s.roundness;
    u.uSoftness.value = Math.max(s.softness, 1e-3);
    u.uTop.value = s.top;
    u.uSides.value = s.sides;
    u.uBottom.value = s.bottom;
  }

  /** Call when the drawing size changes (in drawn pixels). */
  setSize(width: number, height: number) {
    this.sharp.setSize(width, height);
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    this.across.setSize(w, h);
    this.soft.setSize(w, h);
  }

  /** The picture the game is drawn into before it goes on screen. */
  get picture(): THREE.WebGLRenderTarget {
    return this.sharp;
  }

  /** Draws the game and puts it on screen with the soft focus. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const { renderer, settings: s } = this;
    renderer.setRenderTarget(this.sharp);
    renderer.render(scene, camera);

    const { width, height } = this.sharp;
    const aspect = width / height;
    const u = this.mix.uniforms;
    u.uAspect.value = aspect;
    this.keepSharp.forEach((point, i) => {
      this.corner.copy(point).project(camera);
      this.onScreen[i].set(this.corner.x * 0.5 + 0.5, this.corner.y * 0.5 + 0.5);
    });
    const area = sharpAreaAround(this.onScreen, aspect, s.margin);
    (u.uArea.value as THREE.Vector4).set(area.x, area.y, area.halfWidth, area.halfHeight);

    const strength = s.softFocus ? s.strength : 0;
    if (strength > 0) {
      // The blur's reach in the half-size copy's pixels, spread over the steps of one pass.
      const step = (s.blur * this.soft.height) / BLUR_REACH;
      this.pass(this.blur, this.sharp.texture, this.across, step / this.across.width, 0);
      this.pass(this.blur, this.across.texture, this.soft, 0, step / this.soft.height);
    }
    this.show(strength);
  }

  /** Puts `picture` on screen, mixed with its blurred copy by `strength` (0: just as it is). */
  show(strength = 0) {
    this.mix.uniforms.uStrength.value = strength;
    this.quad.material = this.mix;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quad, this.screen);
  }

  private pass(material: THREE.ShaderMaterial, from: THREE.Texture, to: THREE.WebGLRenderTarget, x: number, y: number) {
    material.uniforms.uPicture.value = from;
    (material.uniforms.uStep.value as THREE.Vector2).set(x, y);
    this.quad.material = material;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.quad, this.screen);
  }
}

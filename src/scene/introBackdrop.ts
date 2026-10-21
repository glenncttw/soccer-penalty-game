import * as THREE from 'three';

const COLOR = '#402985'; // Croky purple
const RIM_COLOR = '#ffcf3a'; // the gold of the Speel nu button
const RIM_WIDTH = 6; // CSS pixels of gold around the hole
const BALL_LAYER = 7; // the ball (and the lights on it) are drawn again on this layer, over the purple

/**
 * The solid purple behind the intro, drawn in WebGL so the real ball can sit on top of it. On Speel nu
 * a round hole with a gold rim opens up from the ball and grows past the corners, showing the pitch;
 * Menu closes it again. Each frame it draws the stadium (skipped while it is all purple), then the
 * purple with its hole, then the ball once more over it.
 */
export class IntroBackdrop {
  private readonly overlay = new THREE.Scene();
  private readonly screen = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly uniforms = {
    uColor: { value: new THREE.Color(COLOR) },
    uRim: { value: new THREE.Color(RIM_COLOR) },
    uHole: { value: new THREE.Vector3() }, // centre x, y and radius, in drawing pixels from the bottom left
    uRimWidth: { value: RIM_WIDTH },
    uOpacity: { value: 1 },
  };
  private readonly size = new THREE.Vector2();
  private readonly centre = new THREE.Vector3();
  private lightsOnLayer = false;
  private stadiumDrawn = false;

  constructor(private readonly ball: THREE.Object3D) {
    ball.traverse((o) => o.layers.enable(BALL_LAYER));
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uRim;
        uniform vec3 uHole;
        uniform float uRimWidth;
        uniform float uOpacity;
        void main() {
          float d = distance(gl_FragCoord.xy, uHole.xy);
          float hole = 1.0 - smoothstep(uHole.z - 1.0, uHole.z + 1.0, d);
          float rim = 1.0 - smoothstep(uHole.z + uRimWidth - 1.0, uHole.z + uRimWidth + 1.0, d);
          float alpha = (1.0 - hole) * uOpacity;
          if (alpha <= 0.0) discard;
          gl_FragColor = vec4(mix(uColor, uRim, rim), alpha);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    this.overlay.add(quad);
  }

  /**
   * Draws one frame. `reveal` is how far the purple has gone: 0 all purple, 1 gone (then only the
   * stadium is drawn). With `fade` the purple fades out instead of opening up (reduced motion).
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    reveal: number,
    fade: boolean,
  ) {
    if (reveal >= 1) {
      renderer.render(scene, camera);
      this.stadiumDrawn = true;
      return;
    }
    if (!this.lightsOnLayer) {
      scene.traverse((o) => {
        if (o instanceof THREE.Light) o.layers.enable(BALL_LAYER);
      });
      this.lightsOnLayer = true;
    }
    // All purple: nothing of the stadium shows, so save the phone the work (after drawing it once,
    // which also gets the sun's shadows ready for the ball).
    if (reveal > 0 || !this.stadiumDrawn) {
      renderer.render(scene, camera);
      this.stadiumDrawn = true;
    } else {
      renderer.clear();
    }

    renderer.getDrawingBufferSize(this.size);
    const pixels = this.size.y / renderer.domElement.clientHeight || 1;
    this.centre.copy(this.ball.position).project(camera);
    const x = ((this.centre.x + 1) / 2) * this.size.x;
    const y = ((this.centre.y + 1) / 2) * this.size.y;
    const radius = holeRadius(fade ? 0 : reveal, x, y, this.size.x, this.size.y, RIM_WIDTH * pixels);
    this.uniforms.uHole.value.set(x, y, radius);
    this.uniforms.uRimWidth.value = RIM_WIDTH * pixels;
    this.uniforms.uOpacity.value = fade ? 1 - reveal : 1;

    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.autoUpdate;
    const layers = camera.layers.mask;
    renderer.autoClear = false;
    renderer.render(this.overlay, this.screen);
    renderer.clearDepth();
    // The ball again, on top, with the same lights; the sun's shadows from the stadium pass are kept.
    camera.layers.set(BALL_LAYER);
    renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, camera);
    camera.layers.mask = layers;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.autoClear = autoClear;
  }
}

/**
 * How big the hole is when the purple has gone `reveal` (0..1) of the way, centred on (x, y) on a view
 * `width` by `height`: nothing at 0 (not even the rim), and past the furthest corner, rim and all, at 1.
 */
export function holeRadius(reveal: number, x: number, y: number, width: number, height: number, rim: number) {
  if (reveal <= 0) return -2 * rim;
  const corner = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  return reveal * (corner + rim + 2);
}

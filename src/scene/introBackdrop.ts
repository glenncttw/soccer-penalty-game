import * as THREE from 'three';

const COLOR = '#402985'; // Croky purple
const RIM_COLOR = '#ffcf3a'; // the gold of the Speel nu button
const RIM_WIDTH = 6; // CSS pixels of gold around the hole
/** The ball (and the lights on it, and the intro chips) are drawn again on this layer, over the purple. */
export const OVER_PURPLE_LAYER = 7;

// The tunnel, in shares of how far the ball is from the camera (so it looks the same on every screen).
const TUNNEL_RADIUS = 0.85; // its walls: just past the ball, so they fill the screen around it
const TUNNEL_LENGTH = 9; // how far back it goes (the far end is lost in the dark)
const SEGMENTS = 48; // round the tunnel
const DEEP = '#1d1140'; // the purple far down the tunnel
const FOG_FROM = 2.5; // where it starts to get darker
const FOG_TO = 9; // and where it's all dark

/**
 * The purple behind the intro: a smooth purple tunnel with soft light painted on, like the stadium's
 * baked light, running from the camera past the ball into the dark.
 * It's drawn in WebGL so the real ball can sit in it. On Speel nu a round hole with a gold rim opens up
 * from the ball and grows past the corners, showing the pitch; Menu closes it again. Each frame it draws
 * the stadium (skipped while it is all purple), then the tunnel with its hole, then the ball once more
 * over it.
 */
export class IntroBackdrop {
  private readonly tunnelScene = new THREE.Scene();
  private readonly tunnel = new THREE.Group();
  private readonly fog = new THREE.Fog(DEEP, 1, 2);
  private readonly uniforms = {
    uRim: { value: new THREE.Color(RIM_COLOR) },
    uHole: { value: new THREE.Vector3() }, // centre x, y and radius, in drawing pixels from the bottom left
    uRimWidth: { value: RIM_WIDTH },
    uOpacity: { value: 1 },
  };
  private readonly size = new THREE.Vector2();
  private readonly centre = new THREE.Vector3();
  private readonly toBall = new THREE.Vector3();
  private lightsOnLayer = false;
  private stadiumDrawn = false;

  constructor(private readonly ball: THREE.Object3D) {
    ball.traverse((o) => o.layers.enable(OVER_PURPLE_LAYER));
    // Unlit, with its light painted in (vertex colours), like the stadium's baked stands.
    const material = new THREE.MeshBasicMaterial({
      color: COLOR,
      vertexColors: true,
      side: THREE.BackSide, // seen from inside
      transparent: true,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform vec3 uRim;
          uniform vec3 uHole;
          uniform float uRimWidth;
          uniform float uOpacity;
          void main() {`,
        )
        .replace(
          '#include <premultiplied_alpha_fragment>',
          `{
            float d = distance(gl_FragCoord.xy, uHole.xy);
            float hole = 1.0 - smoothstep(uHole.z - 1.0, uHole.z + 1.0, d);
            float rim = 1.0 - smoothstep(uHole.z + uRimWidth - 1.0, uHole.z + uRimWidth + 1.0, d);
            float alpha = (1.0 - hole) * uOpacity;
            if (alpha <= 0.0) discard;
            gl_FragColor = vec4(mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uRim, 1.0)).rgb, rim), alpha);
          }
          #include <premultiplied_alpha_fragment>`,
        );
    };
    const wall = new THREE.Mesh(tunnelGeometry(), material);
    wall.frustumCulled = false;
    // The far end, in the dark.
    const end = new THREE.Mesh(new THREE.CircleGeometry(TUNNEL_RADIUS * 1.1, SEGMENTS), material);
    end.geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Array(end.geometry.attributes.position.count * 3).fill(1), 3),
    );
    end.position.z = TUNNEL_LENGTH;
    end.frustumCulled = false;
    this.tunnel.add(wall, end);
    this.tunnelScene.add(this.tunnel);
    this.tunnelScene.fog = this.fog;
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
        if (o instanceof THREE.Light) o.layers.enable(OVER_PURPLE_LAYER);
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

    // The tunnel runs from the camera through the ball, sized to how far away the ball is.
    camera.updateMatrixWorld();
    const away = this.toBall.subVectors(this.ball.position, camera.position).length();
    this.tunnel.position.copy(camera.position);
    this.tunnel.up.copy(camera.up).applyQuaternion(camera.quaternion);
    this.tunnel.lookAt(this.ball.position);
    this.tunnel.scale.setScalar(away);
    this.fog.near = FOG_FROM * away;
    this.fog.far = FOG_TO * away;

    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.autoUpdate;
    const layers = camera.layers.mask;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.clearDepth();
    renderer.render(this.tunnelScene, camera);
    renderer.clearDepth();
    // The ball again, on top, with the same lights; the sun's shadows from the stadium pass are kept.
    camera.layers.set(OVER_PURPLE_LAYER);
    renderer.render(scene, camera);
    camera.layers.mask = layers;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.autoClear = autoClear;
  }
}

/**
 * The tunnel's wall, a smooth tube round the z axis from just behind the camera to TUNNEL_LENGTH. Its
 * light is painted into the vertex colours the way the stadium's is baked: the top a little lighter
 * than the bottom, the sides in between. On average it's exactly the purple.
 */
function tunnelGeometry() {
  const geometry = new THREE.CylinderGeometry(TUNNEL_RADIUS, TUNNEL_RADIUS, TUNNEL_LENGTH + 1, SEGMENTS, 1, true);
  geometry.rotateX(Math.PI / 2); // its axis along z
  geometry.translate(0, 0, (TUNNEL_LENGTH - 1) / 2); // from 1 behind the camera to the far end
  const position = geometry.attributes.position;
  const shade = new Float32Array(position.count);
  for (let k = 0; k < position.count; k++) {
    const top = (position.getY(k) / TUNNEL_RADIUS + 1) / 2; // 1 at the top of the tunnel, 0 at the bottom
    shade[k] = 0.8 + 0.4 * top * top;
  }
  // Scaled so the wall's average is the purple itself.
  const mean = shade.reduce((a, b) => a + b, 0) / shade.length;
  const colors = new Float32Array(position.count * 3);
  for (let k = 0; k < position.count; k++) colors.fill(shade[k] / mean, k * 3, k * 3 + 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
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

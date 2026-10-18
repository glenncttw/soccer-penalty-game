import * as THREE from 'three';
import { BALL_FADE_SETTINGS } from './ballFadeSettings';

/**
 * Makes the ball disappear in halftone dots, like a comic print, when it flies into the stands.
 * The dots are fixed to the screen. Each pixel of the ball is either drawn or not, so the ball
 * stays solid (no see-through sorting with the net or stands) while the dots shrink to nothing.
 * A ball far away is only a few dots wide, so there the grid gets finer to keep the dots readable.
 */
export class BallFade {
  fading = false;
  settings = { ...BALL_FADE_SETTINGS };
  private time = 0;
  private previewing = false;
  private readonly progress = { value: 0 };
  private readonly spacing = { value: 1 };
  private readonly radius: number;

  constructor(
    private readonly ball: THREE.Object3D,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.radius = new THREE.Box3().setFromObject(ball, true).getSize(new THREE.Vector3()).y / 2;
    ball.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of [o.material].flat()) this.addHalftone(m);
    });
  }

  start() {
    if (this.fading) return;
    this.fading = true;
    this.time = 0;
    // The grid is set once, so the dots don't crawl as the ball flies away.
    const distance = this.camera.position.distanceTo(this.ball.getWorldPosition(new THREE.Vector3()));
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * distance;
    const ballPixels = (2 * this.radius * this.renderer.domElement.height) / viewHeight;
    const ratio = this.renderer.getPixelRatio();
    this.spacing.value = Math.max(3 * ratio, Math.min(this.settings.dotSize * ratio, ballPixels / this.settings.dotsAcross));
  }

  /** Plays the fade on the ball where it is, then brings it back (for the settings editor). */
  preview() {
    this.reset();
    this.start();
    this.previewing = true;
  }

  update(dt: number) {
    if (!this.fading) return;
    this.time += dt;
    if (this.previewing && this.time > this.settings.duration + 0.6) return this.reset();
    const t = Math.min(1, this.time / this.settings.duration);
    this.progress.value = t * t * (3 - 2 * t); // eases in and out
    // Shadows can't show the dots, so the shadow goes halfway through; at the end the ball is gone.
    this.ball.traverse((o) => (o.castShadow = t < 0.5));
    this.ball.visible = t < 1;
  }

  reset() {
    this.fading = false;
    this.previewing = false;
    this.progress.value = 0;
    this.ball.traverse((o) => (o.castShadow = o instanceof THREE.Mesh));
    this.ball.visible = true;
  }

  private addHalftone(material: THREE.Material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHalftone = this.progress;
      shader.uniforms.uHalftoneSpacing = this.spacing;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uHalftone;\nuniform float uHalftoneSpacing;\nvoid main() {')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          if (uHalftone > 0.0) {
            // A dot grid turned 45 degrees, fixed to the screen. Each dot shrinks from covering its
            // whole cell (radius 0.71) to nothing.
            vec2 cell = fract(mat2(0.7071, 0.7071, -0.7071, 0.7071) * gl_FragCoord.xy / uHalftoneSpacing) - 0.5;
            if (length(cell) > 0.7072 * (1.0 - uHalftone)) discard;
          }`,
        );
    };
    material.needsUpdate = true;
  }
}

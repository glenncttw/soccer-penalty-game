import * as THREE from 'three';
import { palette } from '../theme';

/** How far out the glowing shell sits, in ball radii. */
const SHELL = 1.3;
/** How far out the glow reaches, in ball radii (the size of the quad it's drawn on). */
const REACH = 2.6;
/** Seconds to light up after the kick, and to go out once the shot is over. */
const FADE_IN = 0.12;
const FADE_OUT = 0.3;

/**
 * A glowing gold sphere around the ball on a perfect strike, in the colours of its trail: a see-through
 * shell with a bright rim, a soft glow outside it and a few streaks of energy swirling round. It's one
 * quad that always faces the camera, set a little in front of the ball so the shell shows over it.
 */
export class BallAura {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** The shot being shown is a perfect strike. */
  perfect = false;
  private level = 0;
  private time = 0;

  constructor(radius: number) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uRadius: { value: radius },
        uLevel: { value: 0 },
        uTime: { value: 0 },
        uEdge: { value: new THREE.Color(palette.gold) },
        uCore: { value: new THREE.Color(0xfffbea) },
      },
      vertexShader: /* glsl */ `
        uniform float uRadius;
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 2.0; // -1..1 across the quad
          // The ball's centre, moved toward the camera so the shell is drawn over the ball.
          vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          centre.xyz += normalize(-centre.xyz) * uRadius * ${SHELL.toFixed(2)};
          centre.xy += position.xy * 2.0 * uRadius * ${REACH.toFixed(2)};
          gl_Position = projectionMatrix * centre;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLevel;
        uniform float uTime;
        uniform vec3 uEdge;
        uniform vec3 uCore;
        varying vec2 vUv;
        void main() {
          float r = length(vUv) * ${REACH.toFixed(2)}; // in ball radii
          float s = ${SHELL.toFixed(2)};
          float angle = atan(vUv.y, vUv.x);
          float pulse = 1.0 + 0.08 * sin(uTime * 14.0);
          // Inside: a faint see-through shell, brighter toward its edge like a bubble.
          float shell = r < s ? 0.12 + 0.6 * pow(r / s, 5.0) : 0.0;
          // Its rim, and the glow outside it, with streaks swirling round.
          float rim = exp(-pow((r - s * pulse) / 0.09, 2.0));
          float swirl = 0.65 + 0.35 * sin(angle * 5.0 - uTime * 9.0 + r * 4.0);
          float glow = r > s ? exp(-(r - s) * 2.2) * swirl : 0.0;
          float fade = 1.0 - smoothstep(${(REACH * 0.8).toFixed(2)}, ${REACH.toFixed(2)}, r);
          float a = (shell + rim + glow) * fade * uLevel;
          vec3 color = mix(uEdge, uCore, clamp(rim * 0.8, 0.0, 1.0));
          gl_FragColor = vec4(color, a); // added on top: brighter where it's stronger
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 1; // after the trail
  }

  /** A new shot: `perfect` says whether it gets the glow. */
  begin(perfect: boolean) {
    this.perfect = perfect;
    this.level = 0;
    this.mesh.visible = false;
  }

  /**
   * Follows `ball` for one frame of `dt` seconds. `on` says the shot is still going (flying, before
   * its first touch); `shown` is how solid the ball is (it fades out in the stands).
   */
  update(ball: THREE.Object3D, on: boolean, shown: number, dt: number) {
    const target = this.perfect && on ? 1 : 0;
    this.level = target > this.level ? Math.min(1, this.level + dt / FADE_IN) : Math.max(0, this.level - dt / FADE_OUT);
    this.time += dt;
    this.mesh.position.copy(ball.position);
    const level = this.level * shown;
    this.mesh.visible = level > 0;
    this.mesh.material.uniforms.uLevel.value = level;
    this.mesh.material.uniforms.uTime.value = this.time;
  }
}

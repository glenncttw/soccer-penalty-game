import * as THREE from 'three';
import { BALL_RADIUS } from '../dimensions';
import { palette } from '../theme';

/** Faceted ball with dark patches so its spin reads clearly. */
export function createBallMesh(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(BALL_RADIUS, 1);
  const white = new THREE.Color(palette.ball);
  const dark = new THREE.Color(palette.ballPatch);
  const colors: number[] = [];
  const faces = geo.getAttribute('position').count / 3;
  for (let f = 0; f < faces; f++) {
    const c = f % 7 === 0 ? dark : white;
    for (let v = 0; v < 3; v++) colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }));
  mesh.castShadow = true;
  return mesh;
}

/** A fading ribbon behind the ball that makes its curl visible. */
export class BallTrail {
  readonly mesh: THREE.Mesh;
  private readonly points: THREE.Vector3[] = [];
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;

  constructor(private readonly length = 60, private readonly width = 0.08) {
    this.positions = new Float32Array(length * 2 * 3);
    this.alphas = new Float32Array(length * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    const index: number[] = [];
    for (let i = 0; i < length - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(palette.pink) } },
      vertexShader: `attribute float alpha; varying float vAlpha;
        void main() { vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; varying float vAlpha;
        void main() { gl_FragColor = vec4(color, vAlpha); }`,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
  }

  push(p: THREE.Vector3) {
    this.points.unshift(p.clone());
    if (this.points.length > this.length) this.points.pop();
    this.rebuild();
  }

  clear() {
    this.points.length = 0;
    this.rebuild();
  }

  private rebuild() {
    this.alphas.fill(0);
    const n = this.points.length;
    for (let i = 0; i < this.length; i++) {
      const p = this.points[Math.min(i, n - 1)] ?? new THREE.Vector3();
      const w = this.width * (1 - i / this.length);
      this.positions.set([p.x, p.y + w, p.z, p.x, p.y - w, p.z], i * 6);
      if (i < n) {
        const a = 0.85 * (1 - i / n);
        this.alphas[i * 2] = a;
        this.alphas[i * 2 + 1] = a;
      }
    }
    const geo = this.mesh.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('alpha').needsUpdate = true;
  }
}

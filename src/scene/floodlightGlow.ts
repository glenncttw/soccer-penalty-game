import * as THREE from 'three';
import { FLOODLIGHT_SETTINGS, type FloodlightSettings } from './floodlightSettings';

/** Node names in the Blender export: every floodlight starts with this. */
const FLOODLIGHT_PREFIX = 'FLOOD_Light_';
/** The material of the lamp panel's bright lamps. */
const LAMP_MATERIAL = 'M_Floodlight_Emissive';
/** How far each glow sits in front of its lamp (towards the camera), in metres, so the panel's rim doesn't cut it. */
const LIFT = 0.3;

interface Lamp {
  centre: THREE.Vector3;
  radius: number;
}

/**
 * A soft glow on each floodlight lamp: the lamp itself turns bright white, with a warm halo
 * around it that spills a little over the panel, like a camera sees a bright light. All lamps are drawn in one go as squares that
 * always face the camera, added on top of what's behind them. Much cheaper than a full-screen
 * bloom, and the glows hide behind the stands like the floodlights do.
 */
export class FloodlightGlow {
  readonly group = new THREE.Group();
  /** How many lamps were found in the model. */
  readonly lampCount: number;
  private readonly mesh: THREE.Mesh;
  private readonly radii: Float32Array;
  private readonly sizes: Float32Array;
  private readonly uniforms = {
    color: { value: new THREE.Color() },
    edgeColor: { value: new THREE.Color() },
    opacity: { value: 1 },
    spread: { value: 1 },
  };

  /**
   * Finds the lamps in the stadium model. `viewFrom` is where the camera usually stands:
   * each glow is moved a little towards it.
   */
  constructor(stadium: THREE.Object3D, viewFrom: THREE.Vector3, settings: FloodlightSettings = FLOODLIGHT_SETTINGS) {
    this.group.name = 'FloodlightGlow';
    const lamps = findLamps(stadium);
    this.lampCount = lamps.length;
    const centres = new Float32Array(lamps.length * 3);
    this.radii = new Float32Array(lamps.map((l) => l.radius));
    this.sizes = new Float32Array(lamps.length);
    lamps.forEach((l, i) => l.centre.clone().add(viewFrom.clone().sub(l.centre).setLength(LIFT)).toArray(centres, i * 3));

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('center', new THREE.InstancedBufferAttribute(centres, 3));
    geo.setAttribute('size', new THREE.InstancedBufferAttribute(this.sizes, 1));
    geo.instanceCount = lamps.length;
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 center;
        attribute float size;
        varying vec2 vUv;
        void main() {
          vUv = position.xy;
          vec4 mv = modelViewMatrix * vec4(center, 1.0);
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform vec3 edgeColor;
        uniform float opacity;
        uniform float spread;
        varying vec2 vUv;
        void main() {
          float d = length(vUv) * spread; // distance from the lamp's middle, in lamp radii
          // The lamp itself turns bright; around it a halo fades out from its rim to the square's edge.
          float lamp = 1.0 - smoothstep(0.55, 1.0, d);
          float halo = pow(max(1.0 - (d - 0.8) / max(spread - 0.8, 0.01), 0.0), 2.0);
          vec3 glow = mix(edgeColor * 0.6 * min(halo, 1.0), color, lamp);
          gl_FragColor = vec4(glow * opacity, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false; // the squares are placed in the shader
    this.mesh.renderOrder = 1001; // after the sky, so the glow adds onto it
    this.group.add(this.mesh);
    this.update(settings);
  }

  /** Applies new settings. */
  update(s: FloodlightSettings) {
    this.group.visible = s.glow && this.lampCount > 0;
    this.uniforms.color.value.set(s.glowColor);
    this.uniforms.edgeColor.value.set(s.glowEdgeColor);
    this.uniforms.opacity.value = s.glowOpacity;
    this.uniforms.spread.value = s.glowSize;
    for (let i = 0; i < this.sizes.length; i++) this.sizes[i] = this.radii[i] * s.glowSize;
    (this.mesh.geometry.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Every lamp in the floodlights' lamp meshes: each separate piece of the mesh is one lamp. */
export function findLamps(stadium: THREE.Object3D): Lamp[] {
  stadium.updateMatrixWorld(true);
  const lamps: Lamp[] = [];
  stadium.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || (o.material as THREE.Material).name !== LAMP_MATERIAL) return;
    let light: THREE.Object3D | null = o;
    while (light && !light.name.startsWith(FLOODLIGHT_PREFIX)) light = light.parent;
    if (!light) return;
    const position = o.geometry.attributes.position;
    for (const piece of meshPieces(o.geometry)) {
      const points = piece.map((i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
      const centre = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
      const radius = Math.max(...points.map((p) => p.distanceTo(centre)));
      lamps.push({ centre, radius });
    }
  });
  return lamps;
}

/** Splits a mesh into its separate pieces (vertices joined by triangles or by sharing a spot), as lists of vertex numbers. */
function meshPieces(geometry: THREE.BufferGeometry): number[][] {
  const position = geometry.attributes.position;
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (a: number, b: number) => {
    parent[root(a)] = root(b);
  };
  const index = geometry.index;
  const corner = (k: number) => (index ? index.getX(k) : k);
  const corners = index ? index.count : position.count;
  for (let k = 0; k + 2 < corners; k += 3) {
    join(corner(k), corner(k + 1));
    join(corner(k), corner(k + 2));
  }
  // Vertices at the same spot belong together, even when the mesh keeps them apart for its shading.
  const bySpot = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map((v) => Math.round(v * 1e4)).join();
    const other = bySpot.get(key);
    if (other === undefined) bySpot.set(key, i);
    else join(i, other);
  }
  const pieces = new Map<number, number[]>();
  for (let i = 0; i < position.count; i++) {
    const r = root(i);
    if (!pieces.has(r)) pieces.set(r, []);
    pieces.get(r)!.push(i);
  }
  return [...pieces.values()];
}

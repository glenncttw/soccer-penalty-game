import * as THREE from 'three';
import type { Vec3 } from '../physics/ballForces';

// The stadium's net is made of long, thin strands (two triangles each), which
// can't bend. Splitting each strand into short pieces lets the net bulge where
// the ball hits it; the bulge then wobbles outward and settles.
const MAX_SEGMENT = 0.12; // metres per strand piece
const MAX_PIECES = 64; // per strand, to keep the triangle count in check
const RIPPLES = 3; // hits that can move the net at the same time
const RADIUS = 0.9; // metres: how wide one hit bulges the net
const WAVE_SPEED = 5; // metres per second the ripple spreads out
const WOBBLES_PER_SECOND = 2.6;
const DAMPING = 4.2; // how quickly the wobble dies out
const LIFE = 1.6; // seconds until a hit has settled
const PIN = 0.35; // metres from the goal frame and the ground over which the net is held still
// The ball also drags the surrounding mesh toward it. Seen from behind the ball,
// that pull (not the push away from the camera) is what makes a hit visible.
const PINCH = 2.2;

/**
 * Splits every thin quad (two triangles sharing their longest edge) into pieces
 * no longer than `maxSegment` along its length. Other triangles are kept as they are.
 * Returns a new, non-indexed geometry with positions and normals.
 */
export function subdivideStrands(source: THREE.BufferGeometry, maxSegment: number): THREE.BufferGeometry {
  const pos = source.getAttribute('position');
  const nor = source.getAttribute('normal');
  const index = source.index ? Array.from(source.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i);
  const n = (i: number) => (nor ? new THREE.Vector3().fromBufferAttribute(nor, i) : new THREE.Vector3());

  // Each triangle's longest edge; triangles that share it form one strand.
  const byEdge = new Map<string, number[]>();
  const longest: [number, number, number][] = [];
  for (let t = 0; t < index.length / 3; t++) {
    const [a, b, c] = index.slice(t * 3, t * 3 + 3);
    const edges: [number, number, number][] = [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ];
    edges.sort((e, f) => v(f[0]).distanceToSquared(v(f[1])) - v(e[0]).distanceToSquared(v(e[1])));
    longest.push(edges[0]);
    const key = edges[0][0] < edges[0][1] ? `${edges[0][0]}:${edges[0][1]}` : `${edges[0][1]}:${edges[0][0]}`;
    byEdge.set(key, [...(byEdge.get(key) ?? []), t]);
  }

  const outPos: number[] = [];
  const outNor: number[] = [];
  const faceNormal = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const emit = (verts: [THREE.Vector3, THREE.Vector3][], facing: THREE.Vector3) => {
    const flip = faceNormal(verts[0][0], verts[1][0], verts[2][0]).dot(facing) < 0;
    for (const [p, normal] of flip ? [verts[0], verts[2], verts[1]] : verts) {
      outPos.push(p.x, p.y, p.z);
      outNor.push(normal.x, normal.y, normal.z);
    }
  };

  const done = new Set<number>();
  for (const tris of byEdge.values()) {
    if (tris.length !== 2) continue;
    const [a, b, cA] = longest[tris[0]];
    const cB = longest[tris[1]][2];
    const [i0, i1, i2] = index.slice(tris[0] * 3, tris[0] * 3 + 3);
    const facing = faceNormal(v(i0), v(i1), v(i2));
    // The quad's outline is a, cA, b, cB. Its two short, opposite edges are the strand's ends.
    const ends13 = v(a).distanceTo(v(cA)) + v(b).distanceTo(v(cB));
    const ends24 = v(cA).distanceTo(v(b)) + v(cB).distanceTo(v(a));
    const [rail0, rail1]: [number, number][] = ends13 < ends24 ? [[a, cB], [cA, b]] : [[a, cA], [cB, b]];
    const length = Math.max(v(rail0[0]).distanceTo(v(rail0[1])), v(rail1[0]).distanceTo(v(rail1[1])));
    const pieces = Math.min(MAX_PIECES, Math.max(1, Math.ceil(length / maxSegment)));
    const point = (rail: [number, number], k: number): [THREE.Vector3, THREE.Vector3] => [
      v(rail[0]).lerp(v(rail[1]), k),
      n(rail[0]).lerp(n(rail[1]), k).normalize(),
    ];
    for (let i = 0; i < pieces; i++) {
      const r0a = point(rail0, i / pieces);
      const r1a = point(rail1, i / pieces);
      const r0b = point(rail0, (i + 1) / pieces);
      const r1b = point(rail1, (i + 1) / pieces);
      emit([r0a, r1a, r1b], facing);
      emit([r0a, r1b, r0b], facing);
    }
    done.add(tris[0]).add(tris[1]);
  }
  // Anything that isn't a strand is copied unchanged.
  for (let t = 0; t < index.length / 3; t++) {
    if (done.has(t)) continue;
    for (const i of index.slice(t * 3, t * 3 + 3)) {
      outPos.push(...v(i).toArray());
      outNor.push(...n(i).toArray());
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(outNor, 3));
  if (!nor) out.computeVertexNormals();
  return out;
}

/** Makes the stadium's net bulge and ripple where the ball hits it (drawn on the GPU). */
export class NetRipple {
  private readonly uniforms = {
    rippleOrigin: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, 0, -1e3)) },
    ripplePush: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4()) },
    rippleTime: { value: 0 },
    ripplePin: { value: new THREE.Vector2() },
  };
  private readonly toLocal = new THREE.Matrix4();

  /** `groundY` and `lineZ` are world positions where the net is fixed. */
  constructor(net: THREE.Mesh, fixedAt: { groundY: number; lineZ: number }) {
    const old = net.geometry;
    net.geometry = subdivideStrands(old, MAX_SEGMENT);
    old.dispose();
    net.geometry.computeBoundingSphere();
    net.geometry.boundingSphere!.radius += 0.5; // room for the bulge

    net.updateWorldMatrix(true, false);
    this.toLocal.copy(net.matrixWorld).invert();
    const pin = new THREE.Vector3(0, fixedAt.groundY, fixedAt.lineZ).applyMatrix4(this.toLocal);
    this.uniforms.ripplePin.value.set(pin.y, pin.z);

    const material = (net.material as THREE.Material).clone();
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${RIPPLE_UNIFORMS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${RIPPLE_DISPLACEMENT}`);
    };
    net.material = material;
  }

  /** The ball hit the net at `point`, moving along `direction`. `strength` is the bulge in metres. */
  hit(point: Vec3, direction: Vec3, strength: number) {
    const { rippleOrigin, ripplePush, rippleTime } = this.uniforms;
    let slot = 0;
    for (let i = 1; i < RIPPLES; i++) if (rippleOrigin.value[i].w < rippleOrigin.value[slot].w) slot = i;
    const p = new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(this.toLocal);
    const d = new THREE.Vector3(direction.x, direction.y, direction.z).transformDirection(this.toLocal);
    rippleOrigin.value[slot].set(p.x, p.y, p.z, rippleTime.value);
    ripplePush.value[slot].set(d.x, d.y, d.z, strength);
  }

  update(dt: number) {
    this.uniforms.rippleTime.value += dt;
  }
}

const RIPPLE_UNIFORMS = /* glsl */ `
  #define RIPPLES ${RIPPLES}
  uniform vec4 rippleOrigin[RIPPLES]; // xyz: where the ball hit, w: when (seconds)
  uniform vec4 ripplePush[RIPPLES]; // xyz: push direction, w: strength (metres)
  uniform float rippleTime;
  uniform vec2 ripplePin; // x: ground height, y: goal line z
`;

const RIPPLE_DISPLACEMENT = /* glsl */ `
  float held = smoothstep(0.0, ${PIN.toFixed(3)}, transformed.y - ripplePin.x)
    * smoothstep(0.0, ${PIN.toFixed(3)}, ripplePin.y - transformed.z);
  for (int i = 0; i < RIPPLES; i++) {
    float age = rippleTime - rippleOrigin[i].w;
    float dist = distance(transformed, rippleOrigin[i].xyz);
    float since = age - dist / ${WAVE_SPEED.toFixed(3)}; // seconds since the ripple reached this point
    if (since > 0.0 && age < ${LIFE.toFixed(3)}) {
      float bulge = sin(since * ${(WOBBLES_PER_SECOND * Math.PI * 2).toFixed(4)}) * exp(-since * ${DAMPING.toFixed(3)})
        * exp(-dist * dist / ${(RADIUS * RADIUS).toFixed(4)}) * ripplePush[i].w * held;
      vec3 pull = (rippleOrigin[i].xyz - transformed) * ${(PINCH / RADIUS).toFixed(4)};
      transformed += (ripplePush[i].xyz + pull) * bulge;
    }
  }
`;

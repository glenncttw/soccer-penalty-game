import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { subdivideStrands } from './netRipple';

/** A 2 m long, 2 cm wide strand along x, plus one stray triangle. */
function strandGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 2, 0.02, 0, 0, 0.02, 0, 5, 5, 0, 5.1, 5, 0, 5, 5.1, 0], 3),
  );
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 7 }, () => [0, 0, 1]).flat(), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6]);
  return geo;
}

function triangles(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const out: THREE.Triangle[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    out.push(
      new THREE.Triangle(
        new THREE.Vector3().fromBufferAttribute(pos, i),
        new THREE.Vector3().fromBufferAttribute(pos, i + 1),
        new THREE.Vector3().fromBufferAttribute(pos, i + 2),
      ),
    );
  }
  return out;
}

describe('subdivideStrands', () => {
  const result = subdivideStrands(strandGeometry(), 0.12);
  const tris = triangles(result);
  const strand = tris.slice(0, -1);

  it('splits a long strand into short pieces and keeps other triangles', () => {
    expect(strand.length).toBe(2 * Math.ceil(2 / 0.12));
    for (const t of strand) {
      const xs = [t.a.x, t.b.x, t.c.x];
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(0.12 + 1e-6);
    }
    expect(tris.at(-1)!.a.toArray()).toEqual([5, 5, 0]);
  });

  it('keeps the same shape and facing', () => {
    const area = strand.reduce((sum, t) => sum + t.getArea(), 0);
    expect(area).toBeCloseTo(2 * 0.02, 6);
    for (const t of strand) expect(t.getNormal(new THREE.Vector3()).z).toBeGreaterThan(0.99);
  });
});

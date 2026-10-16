import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureStripes } from './grass';

// A stand-in for the Blender pitch: light grass with dark stripes 1.3 m wide every
// 2.6 m, as two meshes (one per material), like the export.
function syntheticPitch(darkStripes: [number, number][]) {
  const light = new THREE.MeshStandardMaterial({ color: '#549d0d' });
  const dark = new THREE.MeshStandardMaterial({ color: '#247700' });
  const grass = new THREE.Group();
  grass.name = 'PITCH_Grass';
  const strip = (lo: number, hi: number, material: THREE.Material) => {
    const plane = new THREE.PlaneGeometry(hi - lo, 24, 2, 3).rotateX(-Math.PI / 2).translate((lo + hi) / 2, 0, 6);
    return new THREE.Mesh(plane, material);
  };
  const lightParts = [strip(-6.75, -4.55, light), strip(4.55, 6.75, light)];
  for (let i = 0; i + 1 < darkStripes.length; i++) lightParts.push(strip(darkStripes[i][1], darkStripes[i + 1][0], light));
  const darkParts = darkStripes.map(([lo, hi]) => strip(lo, hi, dark));
  // The export merges each material's pieces into one mesh.
  const merge = (parts: THREE.Mesh[], material: THREE.Material) => {
    const geometries = parts.map((m) => m.geometry.toNonIndexed());
    const positions = geometries.flatMap((g) => Array.from(g.getAttribute('position').array));
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Mesh(merged, material);
  };
  grass.add(merge(darkParts, dark), merge(lightParts, light));
  return { grass, light, dark };
}

const STRIPES: [number, number][] = [
  [-4.55, -3.25],
  [-1.95, -0.65],
  [0.65, 1.95],
  [3.25, 4.55],
];

describe('measureStripes', () => {
  it('finds the dark stripes and tells the light material from the dark one', () => {
    const { grass, light, dark } = syntheticPitch(STRIPES);
    const measured = measureStripes(grass);
    expect(measured.light).toBe(light);
    expect(measured.dark).toBe(dark);
    expect(measured.meshes).toHaveLength(2);
    expect(measured.darkStripes).toHaveLength(STRIPES.length);
    measured.darkStripes.forEach(([lo, hi], i) => {
      expect(lo).toBeCloseTo(STRIPES[i][0], 4);
      expect(hi).toBeCloseTo(STRIPES[i][1], 4);
    });
  });

  it('measures in world space, so a moved pitch moves its stripes', () => {
    const { grass } = syntheticPitch(STRIPES);
    const parent = new THREE.Group();
    parent.position.x = 1;
    parent.add(grass);
    expect(measureStripes(grass).darkStripes[0][0]).toBeCloseTo(-3.55, 4);
  });

  it('explains what is wrong when the grass does not have two materials', () => {
    const { grass, light } = syntheticPitch(STRIPES);
    for (const m of grass.children as THREE.Mesh[]) m.material = light;
    expect(() => measureStripes(grass)).toThrow(/exactly two grass materials/);
  });
});

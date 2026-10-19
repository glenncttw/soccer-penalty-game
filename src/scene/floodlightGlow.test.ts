import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FloodlightGlow, findLamps } from './floodlightGlow';
import { FLOODLIGHT_SETTINGS } from './floodlightSettings';

/** A floodlight with a pole and a panel of 2 x 3 round lamps, like the Blender model's. */
function floodlight(name: string, x: number) {
  const light = new THREE.Group();
  light.name = name;
  light.position.set(x, 0, -30);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), new THREE.MeshStandardMaterial({ name: 'M_Floodlight_Structure' }));
  const discs = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) discs.push(new THREE.CircleGeometry(0.25, 16).translate(col * 0.6 - 0.6, 8 + row * 0.6, 0.1));
  }
  const lamps = new THREE.Mesh(mergeGeometries(discs), new THREE.MeshStandardMaterial({ name: 'M_Floodlight_Emissive' }));
  light.add(pole, lamps);
  return light;
}

function mergeGeometries(parts: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  const index: number[] = [];
  for (const g of parts) {
    const base = positions.length / 3;
    positions.push(...g.attributes.position.array);
    index.push(...Array.from(g.index!.array, (i) => i + base));
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(index);
  return merged;
}

describe('FloodlightGlow', () => {
  const stadium = new THREE.Group();
  stadium.add(floodlight('FLOOD_Light_L', -10), floodlight('FLOOD_Light_R', 10), new THREE.Mesh());

  it('finds every lamp of every floodlight, with its middle and size', () => {
    const lamps = findLamps(stadium);
    expect(lamps).toHaveLength(12);
    for (const lamp of lamps) {
      expect(lamp.radius).toBeCloseTo(0.25, 2);
      expect(Math.abs(lamp.centre.x)).toBeGreaterThan(9);
      expect(lamp.centre.y).toBeGreaterThan(7.9);
      expect(lamp.centre.z).toBeCloseTo(-29.9);
    }
  });

  it('gives each lamp a glow that follows the settings', () => {
    const glow = new FloodlightGlow(stadium, new THREE.Vector3(0, 1, 12));
    expect(glow.lampCount).toBe(12);
    const mesh = glow.group.children[0] as THREE.Mesh;
    const sizes = mesh.geometry.getAttribute('size');
    expect(sizes.getX(0)).toBeCloseTo(0.25 * FLOODLIGHT_SETTINGS.glowSize, 2);
    glow.update({ ...FLOODLIGHT_SETTINGS, glow: false, glowSize: 3 });
    expect(glow.group.visible).toBe(false);
    expect(sizes.getX(0)).toBeCloseTo(0.75, 2);
  });
});

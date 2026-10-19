import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FloodlightGlow } from './floodlightGlow';
import { FLOODLIGHT_SETTINGS } from './floodlightSettings';

function floodlight(name: string, x: number) {
  const light = new THREE.Group();
  light.name = name;
  light.position.set(x, 0, -30);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), new THREE.MeshStandardMaterial({ name: 'M_Floodlight_Structure' }));
  const lamps = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 0.1), new THREE.MeshStandardMaterial({ name: 'M_Floodlight_Emissive' }));
  lamps.position.y = 8;
  light.add(pole, lamps);
  return light;
}

describe('FloodlightGlow', () => {
  const stadium = new THREE.Group();
  stadium.add(floodlight('FLOOD_Light_L', -10), floodlight('FLOOD_Light_R', 10), new THREE.Mesh());
  const glow = new FloodlightGlow(stadium, new THREE.Vector3(0, 1, 12));

  it('puts one glow on each lamp panel, a little towards the camera', () => {
    const sprites = glow.group.children as THREE.Sprite[];
    expect(sprites).toHaveLength(2);
    for (const sprite of sprites) {
      expect(Math.abs(sprite.position.x)).toBeCloseTo(10, 0);
      expect(sprite.position.y).toBeCloseTo(8, 0);
      expect(sprite.position.z).toBeGreaterThan(-30);
      expect(sprite.scale.x).toBeCloseTo(2 * FLOODLIGHT_SETTINGS.glowSize, 1);
    }
  });

  it('follows the settings', () => {
    glow.update({ ...FLOODLIGHT_SETTINGS, glow: false, glowSize: 1, glowOpacity: 0.2 });
    expect(glow.group.visible).toBe(false);
    const sprite = glow.group.children[0] as THREE.Sprite;
    expect(sprite.scale.x).toBeCloseTo(2, 1);
    expect((sprite.material as THREE.SpriteMaterial).opacity).toBe(0.2);
  });
});

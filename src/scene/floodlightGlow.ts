import * as THREE from 'three';
import { FLOODLIGHT_SETTINGS, type FloodlightSettings } from './floodlightSettings';

/** Node names in the Blender export: every floodlight starts with this. */
const FLOODLIGHT_PREFIX = 'FLOOD_Light_';
/** The material of the lamp panel's bright lamps. */
const LAMP_MATERIAL = 'M_Floodlight_Emissive';
/** How far the glow sits in front of the panel (towards the camera), in metres, so the panel's frame doesn't cut it. */
const LIFT = 0.6;

/**
 * A soft glow around each floodlight's lamp panel: one camera-facing picture per floodlight,
 * a warm white that fades out to nothing, added on top of what's behind it. Much cheaper
 * than a full-screen bloom, and it hides behind the stands like the floodlights do.
 */
export class FloodlightGlow {
  readonly group = new THREE.Group();
  private readonly material: THREE.SpriteMaterial;
  private readonly lamps: { sprite: THREE.Sprite; width: number }[] = [];

  /**
   * Finds the lamp panels in the stadium model. `viewFrom` is where the camera usually stands:
   * the glow is moved a little towards it.
   */
  constructor(stadium: THREE.Object3D, viewFrom: THREE.Vector3, settings: FloodlightSettings = FLOODLIGHT_SETTINGS) {
    this.group.name = 'FloodlightGlow';
    this.material = new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    stadium.updateMatrixWorld(true);
    const lights: THREE.Object3D[] = [];
    stadium.traverse((o) => {
      if (o.name.startsWith(FLOODLIGHT_PREFIX) && !o.parent?.name.startsWith(FLOODLIGHT_PREFIX)) lights.push(o);
    });
    for (const light of lights) {
      const box = new THREE.Box3();
      light.traverse((o) => {
        if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === LAMP_MATERIAL) box.expandByObject(o);
      });
      if (box.isEmpty()) continue;
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const sprite = new THREE.Sprite(this.material);
      sprite.position.copy(centre).add(viewFrom.clone().sub(centre).setLength(LIFT));
      sprite.renderOrder = 1001; // after the sky, so the glow adds onto it
      this.group.add(sprite);
      this.lamps.push({ sprite, width: Math.hypot(size.x, size.z) });
    }
    this.update(settings);
  }

  /** Applies new settings. */
  update(s: FloodlightSettings) {
    this.group.visible = s.glow;
    this.material.color.set(s.glowColor);
    this.material.opacity = s.glowOpacity;
    for (const { sprite, width } of this.lamps) sprite.scale.setScalar(width * s.glowSize);
  }
}

/** A white disc with a soft edge: bright in the middle, gone at the rim. */
function glowTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const t = Math.max(0, 1 - r);
      const a = t * t; // fades out smoothly, brightest in the middle
      const i = (y * n + x) * 4;
      data.set([255, 255, 255, Math.round(a * 255)], i);
    }
  }
  const texture = new THREE.DataTexture(data, n, n);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

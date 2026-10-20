import * as THREE from 'three';
import { STANDS_SETTINGS, type StandsSettings } from './standsSettings';

/** The stands' concrete in the model. */
const CONCRETE = 'STATIC_Concrete';
/**
 * The colour the sunlit walls have in the stands' baked picture (T_Stands_Combined, the brightest
 * quarter of the concrete's texels): this is what turns into `wallColor`.
 */
const BAKED_WALL = '#e5c8b2';

/**
 * Colours the stands' concrete (see standsSettings.ts) without baking it again in Blender: the baked
 * picture is tinted, each colour channel by how much `wallColor` differs from the sunlit walls' baked
 * colour, so the light and shade baked into it stay as they are. Call it after setUpLighting.
 */
export class StandsColor {
  private readonly material: THREE.MeshBasicMaterial;

  constructor(model: THREE.Object3D, s: StandsSettings = STANDS_SETTINGS) {
    const concrete = model.getObjectByName(CONCRETE);
    if (!(concrete instanceof THREE.Mesh) || !(concrete.material instanceof THREE.MeshBasicMaterial)) {
      throw new Error(`Stadium: ${CONCRETE} has no baked material to colour`);
    }
    // Its own copy: the floodlight towers share the baked picture's material.
    this.material = concrete.material.clone();
    concrete.material = this.material;
    this.update(s);
  }

  update(s: StandsSettings) {
    const wall = new THREE.Color(s.wallColor);
    const baked = new THREE.Color(BAKED_WALL);
    // Both are in linear light (THREE.Color keeps it so), where the baked picture is multiplied by the colour.
    this.material.color.setRGB(wall.r / baked.r, wall.g / baked.g, wall.b / baked.b, THREE.LinearSRGBColorSpace);
  }
}

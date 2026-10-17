import * as THREE from 'three';
import { setupStadiumLighting } from './stadium_lighting.js';

/** The light baked in Blender: KTX2 pictures (with WebP copies as a fallback) and a panorama. */
const BAKES_URL = `${import.meta.env.BASE_URL}assets/stadium/bakes/`;
/** The KTX2 decoder, copied from node_modules/three/examples/jsm/libs/basis/ so it's served with the game. */
const BASIS_URL = `${import.meta.env.BASE_URL}basis/`;

/**
 * Lights the stadium with the light baked in Blender (see public/assets/stadium/bakes/README.md):
 * - the stands, rails, floodlights, trees and ground show their baked light and ignore lights,
 * - the ad boards, goal and grass keep the live sun and its shadows, plus baked soft light,
 * - the net and corner flags get soft light and reflections from a panorama taken at the ball's spot.
 * The sun comes from the model, already aimed to match the bakes. There is no fill light: the bakes
 * and the panorama hold all the soft light.
 *
 * Call it after applyGrass, so the baked light goes onto the grass's own material.
 * `model` is the glTF scene itself: the sun's shadow area is placed in its coordinates.
 */
export async function setUpLighting(renderer: THREE.WebGLRenderer, model: THREE.Object3D) {
  return setupStadiumLighting(renderer, model, {
    bakes: BAKES_URL,
    format: 'ktx2',
    standsHQ: false,
    basisPath: BASIS_URL,
  });
}

/** Gives something that moves (the ball, the keeper) the panorama's soft light and reflections, and live shadows. */
export function lightMovingObject(object: THREE.Object3D, envMap: THREE.Texture) {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of [o.material].flat()) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.envMap = envMap;
      m.envMapIntensity = 1;
      m.needsUpdate = true;
    }
  });
}

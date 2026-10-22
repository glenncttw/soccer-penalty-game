import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Glenn's Blender keeper (the blue bird), made lighter for the web. Replace this file to update it. */
export const KEEPER_URL = `${import.meta.env.BASE_URL}assets/keeper/BlueBird_GK.glb`;

/** How tall the keeper stands in the game, in metres (the export is already 1.6 m). */
export const KEEPER_HEIGHT = 1.6;

/**
 * Loads the keeper model, scaled so it stands KEEPER_HEIGHT tall: origin between
 * the feet, facing the shooter (+z). Its rig and animations are in the file, but
 * nothing plays them yet, so it stands in its rest pose.
 */
export async function loadKeeperModel(): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(KEEPER_URL);
  const model = gltf.scene;
  const height = new THREE.Box3().setFromObject(model).max.y; // its feet are at 0
  if (height > 0) model.scale.setScalar(KEEPER_HEIGHT / height);
  return model;
}

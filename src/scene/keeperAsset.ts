import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Glenn's Blender keeper (the blue bird), made lighter for the web. Replace this file to update it. */
export const KEEPER_URL = `${import.meta.env.BASE_URL}assets/keeper/BlueBird3_GK.glb`;

/**
 * Loads the keeper model at the size it was made in Blender: origin between the
 * feet, facing the shooter (+z). Its rig and animations are in the file, but
 * nothing plays them yet, so it stands in its rest pose.
 */
export async function loadKeeperModel(): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(KEEPER_URL);
  return gltf.scene;
}

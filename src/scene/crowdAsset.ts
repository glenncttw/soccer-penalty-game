import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Glenn's Blender crowd person. Replace this file to update it. */
export const CROWD_PERSON_URL = `${import.meta.env.BASE_URL}assets/crowd/crowd_person.glb`;

/** Loads the crowd person at the size it was made in Blender: origin between the feet, facing +z. */
export async function loadCrowdPerson(): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(CROWD_PERSON_URL);
  return gltf.scene;
}

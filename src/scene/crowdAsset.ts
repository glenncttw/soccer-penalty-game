import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Where Glenn's Blender crowd files are. Replace them to update the crowd. */
const CROWD_FOLDER = `${import.meta.env.BASE_URL}assets/crowd/`;
/** The body (with the bare head and a scalp under every hair piece). */
export const CROWD_BASE_URL = `${CROWD_FOLDER}crowd_base.glb`;

/** The crowd person's parts as made in Blender: origin between the feet, facing +z. */
export interface CrowdParts {
  /** The body, arms and head, without hair. */
  base: THREE.Object3D;
  /** One head piece (hair or a hat) per file asked for, made in the head's own space. */
  heads: THREE.Mesh[];
}

/** Loads the crowd person's body and the head pieces in `headFiles` (file names in the crowd folder). */
export async function loadCrowdParts(headFiles: string[]): Promise<CrowdParts> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [base, ...pieces] = await Promise.all(
    [CROWD_BASE_URL, ...headFiles.map((f) => `${CROWD_FOLDER}${f}`)].map((url) => loader.loadAsync(url)),
  );
  const heads = pieces.map((gltf, i) => {
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) mesh ??= o;
    });
    if (!mesh) throw new Error(`Crowd head piece "${headFiles[i]}" has no mesh`);
    return mesh;
  });
  return { base: base.scene, heads };
}

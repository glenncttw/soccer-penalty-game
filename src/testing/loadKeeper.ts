import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitKeeper } from '../scene/keeperAsset';
import { KeeperRig } from '../scene/keeperRig';

/** The real keeper model and its animations, read from public/ (for tests, which have no web server). */
export async function loadKeeperRig() {
  const file = readFileSync(new URL('../../public/assets/keeper/BlueBird_GK.glb', import.meta.url));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(data, '');
  const { model, animations } = fitKeeper(gltf);
  return new KeeperRig(model, animations);
}

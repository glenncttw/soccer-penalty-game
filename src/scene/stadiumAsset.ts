import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { WorldConfig } from '../worldConfig';
import { STADIUM_NODES, measureWorld } from './measureStadium';

/** The Blender export. Replace this file with a new export to update the stadium. */
export const STADIUM_URL = `${import.meta.env.BASE_URL}assets/stadium/Stadium_Recon_web.glb`;

// Large or see-through meshes whose shadows add noise or cost without adding much.
const NO_SHADOW_CASTERS = new Set([STADIUM_NODES.goalNet, 'STATIC_Trees', 'GROUND_Outside', STADIUM_NODES.grass]);

export interface Stadium {
  /** Everything static: pitch, goal, stands, scenery and the sun. */
  environment: THREE.Group;
  /** The model's football, detached so gameplay can move it. Origin = ball centre. */
  ball: THREE.Object3D;
  sun: THREE.DirectionalLight | null;
  config: WorldConfig;
  dispose(): void;
}

export async function loadStadium(): Promise<Stadium> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(STADIUM_URL);

  // The model's goal line is at z = -21 (GOAL_Frame's origin). Gameplay puts the
  // goal line at z = 0, so the only mapping needed is a shift along z.
  const environment = new THREE.Group();
  environment.name = 'Stadium';
  environment.add(gltf.scene);
  const frame = gltf.scene.getObjectByName(STADIUM_NODES.goalFrame);
  if (!frame) throw new Error(`Stadium model is missing the "${STADIUM_NODES.goalFrame}" node`);
  gltf.scene.position.z = -frame.position.z;
  environment.updateWorldMatrix(true, true);

  const camera = gltf.cameras[0];
  if (!camera) throw new Error('Stadium model has no gameplay camera');
  const config = measureWorld(environment, camera as THREE.PerspectiveCamera);

  let sun: THREE.DirectionalLight | null = null;
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.receiveShadow = true;
      o.castShadow = !hasAncestorNamed(o, NO_SHADOW_CASTERS);
    }
    if (o instanceof THREE.DirectionalLight) sun = o;
  });

  // Detach the ball: gameplay drives its position and rotation from physics.
  const ball = gltf.scene.getObjectByName(STADIUM_NODES.ball)!;
  ball.removeFromParent();
  ball.position.set(0, 0, 0);
  ball.rotation.set(0, 0, 0);
  ball.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  camera.removeFromParent();

  return {
    environment,
    ball,
    sun,
    config,
    dispose() {
      for (const root of [environment, ball]) {
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry.dispose();
          for (const m of [o.material].flat()) {
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
            m.dispose();
          }
        });
        root.removeFromParent();
      }
    },
  };
}

function hasAncestorNamed(o: THREE.Object3D, names: Set<string>): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (names.has(p.name)) return true;
  return false;
}

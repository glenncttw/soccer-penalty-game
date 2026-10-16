import * as THREE from 'three';
import type { CameraConfig, GoalConfig, WorldConfig } from '../worldConfig';
import { validateWorldConfig } from '../worldConfig';

/** Node names in the Blender export that gameplay depends on. */
export const STADIUM_NODES = {
  goalFrame: 'GOAL_Frame',
  goalNet: 'GOAL_Net',
  ball: 'Football_Ball',
  grass: 'PITCH_Grass',
  markings: 'STATIC_Markings',
} as const;

function required(root: THREE.Object3D, name: string): THREE.Object3D {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`Stadium model is missing the "${name}" node`);
  return o;
}

/**
 * Measures the goal by casting rays at the real frame and net geometry, so goal
 * detection and collisions match what the player sees.
 */
export function measureGoal(frame: THREE.Object3D, net: THREE.Object3D): GoalConfig {
  frame.updateWorldMatrix(true, true);
  const lineZ = frame.getWorldPosition(new THREE.Vector3()).z;
  const box = new THREE.Box3().setFromObject(frame, true);
  const outerHalfWidth = Math.max(-box.min.x, box.max.x);
  const outerHeight = box.max.y;
  const midY = outerHeight / 2;

  const ray = new THREE.Raycaster();
  const hit = (target: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3) => {
    ray.set(from, dir.normalize());
    ray.far = 50;
    return ray.intersectObject(target, target !== frame)[0]?.point ?? null;
  };
  const need = (p: THREE.Vector3 | null, what: string) => {
    if (!p) throw new Error(`Could not measure the goal ${what} from the stadium model`);
    return p;
  };
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const back = new THREE.Vector3(0, 0, -1);

  // Inside faces of the posts and the underside of the crossbar, from the goal mouth
  // (the frame mesh only, without its child net).
  const innerHalfWidth = need(hit(frame, new THREE.Vector3(0, midY, lineZ), right.clone()), 'post').x;
  const crossbarY = need(hit(frame, new THREE.Vector3(0, midY, lineZ), up.clone()), 'crossbar').y;
  const postCentreX = (innerHalfWidth + outerHalfWidth) / 2;
  const postFront = need(hit(frame, new THREE.Vector3(postCentreX, midY, lineZ + 2), back.clone()), 'post front').z;
  const postThickness = outerHalfWidth - innerHalfWidth;
  const postDepth = 2 * (postFront - lineZ);

  // Net: its strands leave gaps that rays slip through, so read its shape from the
  // vertices instead: the roof is the top band, and its back edge is where the
  // sloping back panel starts.
  const netBox = new THREE.Box3().setFromObject(net, true);
  const netHalfWidth = Math.max(-netBox.min.x, netBox.max.x);
  const netRoofY = netBox.max.y;
  let netRoofBackZ = lineZ;
  net.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y > netRoofY - 0.03) netRoofBackZ = Math.min(netRoofBackZ, v.z);
    }
  });
  const netBackZ = netBox.min.z;

  return {
    lineZ,
    innerHalfWidth,
    crossbarY,
    outerHalfWidth,
    outerHeight,
    postThickness,
    postDepth,
    netHalfWidth,
    netRoofY,
    netRoofBackZ,
    netBackZ,
  };
}

/** Reads every gameplay coordinate from the placed stadium. */
export function measureWorld(stadium: THREE.Object3D, camera: THREE.Camera & { fov?: number }): WorldConfig {
  stadium.updateWorldMatrix(true, true);
  const goal = measureGoal(required(stadium, STADIUM_NODES.goalFrame), required(stadium, STADIUM_NODES.goalNet));

  const ball = required(stadium, STADIUM_NODES.ball);
  const ballBox = new THREE.Box3().setFromObject(ball, true);
  const ballStart = ball.getWorldPosition(new THREE.Vector3());
  const ballRadius = (ballBox.max.y - ballBox.min.y) / 2;

  const groundY = new THREE.Box3().setFromObject(required(stadium, STADIUM_NODES.grass), true).max.y;

  camera.updateWorldMatrix(true, false);
  const q = camera.getWorldQuaternion(new THREE.Quaternion());
  const cameraConfig: CameraConfig = {
    position: camera.getWorldPosition(new THREE.Vector3()),
    quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
    fov: camera.fov ?? 50,
  };

  return validateWorldConfig({
    goal,
    ballStart: { x: ballStart.x, y: ballStart.y, z: ballStart.z },
    ballRadius,
    groundY,
    camera: cameraConfig,
  });
}

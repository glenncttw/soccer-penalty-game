import type { Vec3 } from './ballForces';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * One solid part of the keeper (a glove, the head, the body, an arm...), fitted to the 3D model
 * around one of its bones. It's a ball (`halfHeight` 0) or a capsule along its own y, placed at
 * `offset` and turned by `rotation` in that bone's frame. Metres.
 */
export interface KeeperPartShape {
  name: string;
  radius: number;
  halfHeight: number;
  offset: Vec3;
  rotation: Quat;
}

/** Where a part's bone is in the world this moment. */
export interface KeeperPartPose {
  position: Vec3;
  rotation: Quat;
}

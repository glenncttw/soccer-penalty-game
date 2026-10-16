import type { Vec3 } from './physics/ballForces';

/**
 * Gameplay coordinates, measured from the imported stadium at load time.
 * The stadium is placed so its goal line sits on z = 0; shots travel toward -z.
 */
export interface GoalConfig {
  /** z of the goal line (the centre of the posts). */
  lineZ: number;
  /** Half the inside width between the posts. */
  innerHalfWidth: number;
  /** Height of the underside of the crossbar. */
  crossbarY: number;
  /** Half the outside width, including the posts. */
  outerHalfWidth: number;
  /** Height of the top of the crossbar. */
  outerHeight: number;
  /** Post and crossbar thickness across (x/y) and along (z) the goal line. */
  postThickness: number;
  postDepth: number;
  /** Net shape: flat roof at `roofY` back to `roofBackZ`, then sloping to the ground at `backZ`. */
  netHalfWidth: number;
  netRoofY: number;
  netRoofBackZ: number;
  netBackZ: number;
}

export interface CameraConfig {
  position: Vec3;
  quaternion: { x: number; y: number; z: number; w: number };
  /** Vertical field of view in degrees, for a 16:9 frame. */
  fov: number;
}

export interface WorldConfig {
  goal: GoalConfig;
  ballStart: Vec3;
  ballRadius: number;
  groundY: number;
  camera: CameraConfig;
}

/** Throws if a measured value is clearly wrong, so a broken export fails loudly. */
export function validateWorldConfig(c: WorldConfig): WorldConfig {
  const g = c.goal;
  const checks: [boolean, string][] = [
    [g.innerHalfWidth > 0.5 && g.innerHalfWidth < g.outerHalfWidth, 'goal width'],
    [g.crossbarY > 0.5 && g.crossbarY < g.outerHeight, 'crossbar height'],
    [g.postThickness > 0.01 && g.postThickness < 0.5, 'post thickness'],
    [g.netBackZ < g.lineZ && g.netRoofBackZ <= g.lineZ && g.netBackZ <= g.netRoofBackZ, 'net depth'],
    [c.ballRadius > 0.05 && c.ballRadius < 0.5, 'ball radius'],
    [c.ballStart.z > g.lineZ + 3, 'ball in front of the goal'],
    [c.camera.position.z > c.ballStart.z, 'camera behind the ball'],
  ];
  const bad = checks.filter(([ok]) => !ok).map(([, name]) => name);
  if (bad.length) throw new Error(`Stadium model looks wrong: ${bad.join(', ')}`);
  return c;
}

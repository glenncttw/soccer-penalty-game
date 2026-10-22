import RAPIER from '@dimforge/rapier3d-compat';
import { AERO_RADIUS, BALL_MASS } from '../dimensions';
import type { WorldConfig } from '../worldConfig';
import { aeroForce, type Vec3 } from './ballForces';
import { BALL_SPIN_DAMPING, FIXED_STEP } from './flight';
import type { KeeperPartPose, KeeperPartShape } from './keeperBody';

// Collision groups (what each collider is, then what it touches): the keeper's parts are group 2,
// so the ball can be told to pass through them while the keeper catches it.
const BALL_GROUPS = 0x0001ffff;
const BALL_GROUPS_NO_KEEPER = 0x0001fffd;
const KEEPER_GROUPS = 0x0002ffff;

/** What the ball can touch. */
export type Surface = 'ground' | 'woodwork' | 'net' | 'keeper' | 'boards';

/** The ball starting to touch something. */
export interface Contact {
  surface: Surface;
  /** Ball centre when the touch started. */
  point: Vec3;
  /** Ball velocity just before the touch, and its size. */
  velocity: Vec3;
  speed: number;
}

export interface PhysicsWorld {
  world: RAPIER.World;
  ball: RAPIER.RigidBody;
  step(): void;
  /** The touches since the last call, oldest first. */
  takeContacts(): Contact[];
  resetBall(): void;
  kick(velocity: RAPIER.Vector, spin: RAPIER.Vector): void;
  /**
   * Moves the keeper's parts to `parts` (one pose per part, in the order of its shapes) over the
   * next step, or at once with `jump`. Does nothing in a world made without a keeper.
   */
  poseKeeper(parts: readonly KeeperPartPose[], jump?: boolean): void;
  /** Holds the ball at `at` (in the keeper's hands): it stops flying and moves there over the next step. `resetBall` lets go. */
  holdBall(at: Vec3): void;
  /** Lets the ball pass through the keeper (while it is being caught). `resetBall` turns this off. */
  ignoreKeeper(on: boolean): void;
}

export interface WorldOptions {
  /** Adds a keeper made of these parts, standing in this pose. */
  keeper?: { shapes: readonly KeeperPartShape[]; parts: readonly KeeperPartPose[] };
}

export async function createPhysicsWorld(config: WorldConfig, options: WorldOptions = {}): Promise<PhysicsWorld> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;
  const g = config.goal;

  // Which surface each collider is, so touches can be reported by name.
  const surfaces = new Map<number, Surface>();
  const add = (desc: RAPIER.ColliderDesc, surface: Surface, body?: RAPIER.RigidBody) => {
    const collider = world.createCollider(desc, body);
    surfaces.set(collider.handle, surface);
    return collider;
  };

  // Pitch, with its top at the stadium's grass level
  add(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60)
      .setTranslation(0, config.groundY - 0.5, g.lineZ)
      .setFriction(0.8)
      .setRestitution(0.55),
    'ground',
  );

  // Goal frame: square posts and crossbar, matching the model
  const halfT = g.postThickness / 2;
  const halfD = g.postDepth / 2;
  const post = (x: number) =>
    add(
      RAPIER.ColliderDesc.cuboid(halfT, g.outerHeight / 2, halfD)
        .setTranslation(x, g.outerHeight / 2, g.lineZ)
        .setRestitution(0.7),
      'woodwork',
    );
  post(-(g.innerHalfWidth + halfT));
  post(g.innerHalfWidth + halfT);
  add(
    RAPIER.ColliderDesc.cuboid(g.outerHalfWidth, (g.outerHeight - g.crossbarY) / 2, halfD)
      .setTranslation(0, (g.outerHeight + g.crossbarY) / 2, g.lineZ)
      .setRestitution(0.7),
    'woodwork',
  );

  // Net: soft, low-bounce surfaces following the model's net shape
  const soft = (desc: RAPIER.ColliderDesc) => add(desc.setRestitution(0.05).setFriction(1), 'net');
  const roofDepth = g.lineZ - g.netRoofBackZ;
  if (roofDepth > 0.01) {
    soft(
      RAPIER.ColliderDesc.cuboid(g.netHalfWidth, 0.02, roofDepth / 2).setTranslation(
        0,
        g.netRoofY,
        g.lineZ - roofDepth / 2,
      ),
    );
  }
  // Sloping back panel from the end of the roof down to the ground
  const dz = g.netRoofBackZ - g.netBackZ;
  const dy = g.netRoofY - config.groundY;
  const angle = Math.atan2(dz, dy); // tilt from vertical: the top leans toward the goal line
  soft(
    RAPIER.ColliderDesc.cuboid(g.netHalfWidth, Math.hypot(dz, dy) / 2, 0.02)
      .setTranslation(0, config.groundY + dy / 2, g.netBackZ + dz / 2)
      .setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }),
  );
  // Side panels: the net's side outline as a thin convex shape
  for (const x of [-g.netHalfWidth, g.netHalfWidth]) {
    const pts: number[] = [];
    for (const dx of [-0.02, 0.02]) {
      pts.push(
        x + dx, config.groundY, g.lineZ,
        x + dx, g.netRoofY, g.lineZ,
        x + dx, g.netRoofY, g.netRoofBackZ,
        x + dx, config.groundY, g.netBackZ,
      );
    }
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
    if (desc) soft(desc);
  }

  // Ad boards, with their exact shape from the model. A dull bounce, so the ball drops along them
  // rather than flying back across the pitch.
  for (const board of config.boards ?? []) {
    add(RAPIER.ColliderDesc.trimesh(board.vertices, board.indices).setRestitution(0.35).setFriction(0.8), 'boards');
  }

  // Ball
  const start = config.ballStart;
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setCcdEnabled(true)
      .setAngularDamping(BALL_SPIN_DAMPING),
  );
  const ballCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(config.ballRadius)
      .setMass(BALL_MASS)
      .setRestitution(0.6)
      .setFriction(0.6)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(BALL_GROUPS),
    ball,
  );

  const keeper = options.keeper ? createKeeper(world, add, options.keeper.shapes, options.keeper.parts) : null;

  const events = new RAPIER.EventQueue(true);
  let contacts: Contact[] = [];

  return {
    world,
    ball,
    step() {
      const v = ball.linvel();
      ball.resetForces(true);
      ball.addForce(aeroForce(v, ball.angvel(), AERO_RADIUS), true);
      world.step(events);
      events.drainCollisionEvents((a, b, started) => {
        const surface = surfaces.get(a === ballCollider.handle ? b : a);
        if (!started || !surface) return;
        const p = ball.translation();
        contacts.push({
          surface,
          point: { x: p.x, y: p.y, z: p.z },
          velocity: { x: v.x, y: v.y, z: v.z },
          speed: Math.hypot(v.x, v.y, v.z),
        });
      });
    },
    takeContacts() {
      const taken = contacts;
      contacts = [];
      return taken;
    },
    resetBall() {
      ball.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      ballCollider.setCollisionGroups(BALL_GROUPS);
      ball.setTranslation(start, true);
      ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      contacts = [];
    },
    kick(velocity, spin) {
      ball.setLinvel(velocity, true);
      ball.setAngvel(spin, true);
    },
    poseKeeper(parts, jump = false) {
      keeper?.pose(parts, jump);
    },
    holdBall(at) {
      if (ball.bodyType() !== RAPIER.RigidBodyType.KinematicPositionBased) {
        ball.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      ball.setNextKinematicTranslation(at);
    },
    ignoreKeeper(on) {
      ballCollider.setCollisionGroups(on ? BALL_GROUPS_NO_KEEPER : BALL_GROUPS);
    },
  };
}

/**
 * The keeper as moving (kinematic) bodies, one for each part of the 3D model (gloves, arms, head,
 * body, feet), each following its bone. Moving them step by step gives them real speed, so a
 * diving glove pushes the ball away like a real save.
 */
function createKeeper(
  world: RAPIER.World,
  add: (desc: RAPIER.ColliderDesc, surface: Surface, body?: RAPIER.RigidBody) => RAPIER.Collider,
  shapes: readonly KeeperPartShape[],
  parts: readonly KeeperPartPose[],
) {
  const bodies = shapes.map((shape) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const glove = shape.name.startsWith('glove');
    const desc =
      shape.halfHeight > 0
        ? RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius)
        : RAPIER.ColliderDesc.ball(shape.radius);
    desc
      .setTranslation(shape.offset.x, shape.offset.y, shape.offset.z)
      .setRotation(shape.rotation)
      .setRestitution(glove ? 0.25 : 0.35)
      .setFriction(glove ? 0.9 : 0.7)
      .setCollisionGroups(KEEPER_GROUPS);
    add(desc, 'keeper', body);
    return body;
  });

  const keeper = {
    pose(next: readonly KeeperPartPose[], jump: boolean) {
      bodies.forEach((body, i) => {
        const { position, rotation } = next[i];
        if (jump) {
          body.setTranslation(position, true);
          body.setRotation(rotation, true);
        } else {
          body.setNextKinematicTranslation(position);
          body.setNextKinematicRotation(rotation);
        }
      });
    },
  };
  keeper.pose(parts, true);
  return keeper;
}

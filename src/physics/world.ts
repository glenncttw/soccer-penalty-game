import RAPIER from '@dimforge/rapier3d-compat';
import { BALL_MASS, BALL_RADIUS, GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH, PENALTY_SPOT_Z, POST_RADIUS } from '../dimensions';
import { aeroForce } from './ballForces';
import { BALL_SPIN_DAMPING, FIXED_STEP } from './flight';


export interface PhysicsWorld {
  world: RAPIER.World;
  ball: RAPIER.RigidBody;
  step(): void;
  resetBall(): void;
  kick(velocity: RAPIER.Vector, spin: RAPIER.Vector): void;
}

export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;

  // Pitch
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setFriction(0.8).setRestitution(0.55),
  );

  // Goal frame
  const halfW = GOAL_WIDTH / 2;
  for (const x of [-halfW, halfW]) {
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(GOAL_HEIGHT / 2, POST_RADIUS).setTranslation(x, GOAL_HEIGHT / 2, 0).setRestitution(0.7),
    );
  }
  world.createCollider(
    RAPIER.ColliderDesc.capsule(halfW, POST_RADIUS)
      .setTranslation(0, GOAL_HEIGHT, 0)
      .setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 })
      .setRestitution(0.7),
  );

  // Net: soft, low-bounce panels behind the goal line
  const net = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRestitution(0.05).setFriction(1),
    );
  net(halfW, GOAL_HEIGHT / 2, 0.02, 0, GOAL_HEIGHT / 2, -GOAL_DEPTH);
  net(0.02, GOAL_HEIGHT / 2, GOAL_DEPTH / 2, -halfW, GOAL_HEIGHT / 2, -GOAL_DEPTH / 2);
  net(0.02, GOAL_HEIGHT / 2, GOAL_DEPTH / 2, halfW, GOAL_HEIGHT / 2, -GOAL_DEPTH / 2);
  net(halfW, 0.02, GOAL_DEPTH / 2, 0, GOAL_HEIGHT, -GOAL_DEPTH / 2);

  // Ball
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, BALL_RADIUS, PENALTY_SPOT_Z)
      .setCcdEnabled(true)
      .setAngularDamping(BALL_SPIN_DAMPING),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS).setMass(BALL_MASS).setRestitution(0.6).setFriction(0.6),
    ball,
  );

  return {
    world,
    ball,
    step() {
      ball.resetForces(true);
      const f = aeroForce(ball.linvel(), ball.angvel(), BALL_RADIUS);
      ball.addForce(f, true);
      world.step();
    },
    resetBall() {
      ball.setTranslation({ x: 0, y: BALL_RADIUS, z: PENALTY_SPOT_Z }, true);
      ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    kick(velocity, spin) {
      ball.setLinvel(velocity, true);
      ball.setAngvel(spin, true);
    },
  };
}

import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../physics/flight';
import { createPhysicsWorld } from '../physics/world';
import type { WorldConfig } from '../worldConfig';
import { BallCatch } from './ballCatch';

const world: WorldConfig = {
  goal: {
    lineZ: 0,
    innerHalfWidth: 2.82,
    crossbarY: 1.92,
    outerHalfWidth: 3,
    outerHeight: 2.1,
    postThickness: 0.18,
    postDepth: 0.18,
    netHalfWidth: 2.885,
    netRoofY: 1.975,
    netRoofBackZ: -1.06,
    netBackZ: -2.6,
  },
  ballStart: { x: 0, y: 0.175, z: 12.4 },
  ballRadius: 0.175,
  groundY: 0,
  camera: { position: { x: 0, y: 0.94, z: 16.03 }, quaternion: { x: -0.014, y: 0, z: 0, w: 1 }, fov: 32.8 },
};
const physics = await createPhysicsWorld(world);

/** Rolls a ball along y = 1 (gravity off for the test: a flat line) past hands at `hands`, stepping at `rate` a second. */
function pass(hands: { x: number; y: number; z: number }, rate = 1 / FIXED_STEP) {
  physics.resetBall();
  physics.world.gravity = { x: 0, y: 0, z: 0 };
  physics.ball.setTranslation({ x: 0, y: 1, z: 6 }, true);
  physics.kick({ x: 0, y: 0, z: -20 }, { x: 0, y: 0, z: 0 });
  physics.world.timestep = 1 / rate;
  const ballCatch = new BallCatch();
  for (let t = 0; t < 0.6; t += 1 / rate) {
    ballCatch.step(hands, physics, 1 / rate);
    physics.step();
  }
  physics.world.gravity = { x: 0, y: -9.81, z: 0 };
  physics.world.timestep = FIXED_STEP;
  return { caught: ballCatch.caught, ball: physics.ball.translation() };
}

describe('BallCatch', () => {
  it.each([30, 60, 120])('takes a ball heading for the hands and holds it there (%s steps a second)', (rate) => {
    const hands = { x: 0.2, y: 1.1, z: 2 };
    const { caught, ball } = pass(hands, rate);
    expect(caught).toBe(true);
    expect(Math.hypot(ball.x - hands.x, ball.y - hands.y, ball.z - hands.z)).toBeLessThan(0.01);
  });

  it('lets a ball that passes too far from the hands fly on', () => {
    const { caught, ball } = pass({ x: 0.6, y: 1, z: 2 });
    expect(caught).toBe(false);
    expect(ball.z).toBeLessThan(0);
  });
});

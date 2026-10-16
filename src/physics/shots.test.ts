import { describe, expect, it } from 'vitest';
import { OutcomeTracker } from '../gameplay/outcome';
import { shapeShot } from '../gameplay/shot';
import type { WorldConfig } from '../worldConfig';
import { FIXED_STEP, solveKick } from './flight';
import { createPhysicsWorld, type Contact } from './world';

// Values measured from the Blender stadium (Stadium_Recon_web.glb), placed with its goal line at z = 0.
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
const outcome = new OutcomeTracker(world.goal, world.ballRadius);

/** Plays one shot through the real pipeline: shot shaping, kick solver, Rapier and goal detection. */
function play(aimX: number, aimY: number, power = 0.87, curl = 0, { followUp = 0 } = {}) {
  physics.resetBall();
  outcome.reset();
  const shot = shapeShot({ aim: { x: aimX, y: aimY, z: 0 }, power, curl, minTargetY: world.ballRadius }, () => 0.5);
  physics.kick(solveKick(world.ballStart, shot.target, shot.speed, shot.spin), shot.spin);
  let maxZ = -Infinity;
  const contacts: Contact[] = [];
  let result: ReturnType<OutcomeTracker['update']> = null;
  let after = 0;
  for (let i = 0; i < 6 / FIXED_STEP && after <= followUp; i++) {
    physics.step();
    contacts.push(...physics.takeContacts());
    const p = physics.ball.translation();
    const v = physics.ball.linvel();
    maxZ = Math.max(maxZ, p.z);
    result = outcome.update(p, Math.hypot(v.x, v.y, v.z), FIXED_STEP);
    if (result) after += FIXED_STEP; // keep simulating `followUp` seconds past the result
  }
  return { result, hitFrame: outcome.hitFrame, maxZ, contacts };
}

describe('shots in the Blender stadium', () => {
  it.each([
    ['centre', 0, 1],
    ['top left', -2.45, 1.6],
    ['top right', 2.45, 1.6],
    ['bottom left', -2.45, 0.35],
    ['bottom right', 2.45, 0.35],
  ])('scores a perfect strike to the %s', (_, x, y) => {
    expect(play(x, y).result).toBe('goal');
  });

  it('scores curled shots into the top corners', () => {
    expect(play(-2.3, 1.5, 0.87, -1).result).toBe('goal');
    expect(play(2.3, 1.5, 0.87, 1).result).toBe('goal');
  });

  it('hits the woodwork when aimed at the crossbar or a post', () => {
    expect(play(0, 2.01).hitFrame).toBe(true);
    expect(play(-2.91, 1).hitFrame).toBe(true);
    expect(play(2.91, 1).hitFrame).toBe(true);
  });

  it('misses wide and over', () => {
    expect(play(3.9, 1).result).toBe('miss');
    expect(play(-3.9, 0.6).result).toBe('miss');
    expect(play(0, 2.9).result).toBe('miss');
  });

  it('skies an overhit shot', () => {
    expect(play(0, 1, 1).result).toBe('miss');
  });

  it('never sends a weak low shot back toward the player', () => {
    const r = play(-2.45, 0.35, 0.15);
    expect(r.result).not.toBeNull();
    expect(r.maxZ).toBeLessThanOrEqual(world.ballStart.z + 0.01);
  });

  it('reports what the ball touches', () => {
    const touched = (r: ReturnType<typeof play>) => r.contacts.filter((c) => c.surface !== 'ground');
    const goal = touched(play(0.6, 1.1, 0.87, 0, { followUp: 0.5 }));
    expect(goal[0].surface).toBe('net');
    expect(goal[0].speed).toBeGreaterThan(15);
    expect(goal[0].point.z).toBeLessThan(0);
    expect(touched(play(0, 2.01))[0].surface).toBe('woodwork');
    expect(touched(play(2.91, 1))[0].surface).toBe('woodwork');
    expect(touched(play(3.9, 1, 0.87, 0, { followUp: 0.5 }))).toEqual([]);
  });

  it('keeps working over many consecutive shots', () => {
    for (let i = 0; i < 10; i++) expect(play((i % 5) - 2, 0.5 + (i % 3) * 0.5).result).toBe('goal');
  });
});

import { describe, expect, it } from 'vitest';
import { KEEPER_SKILL, readShot } from '../ai/keeper';
import { KeeperMotion } from '../ai/keeperMotion';
import { OutcomeTracker } from '../gameplay/outcome';
import { shapeShot } from '../gameplay/shot';
import { loadKeeperRig } from '../testing/loadKeeper';
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

const home = { x: 0, y: 0, z: 0.35 };
const rig = await loadKeeperRig();
const keeper = new KeeperMotion(home, KEEPER_SKILL, rig);
const physics = await createPhysicsWorld(world, { keeper: { shapes: rig.shapes, parts: rig.parts } });
const outcome = new OutcomeTracker(world.goal, world.ballRadius);

/**
 * Plays one shot against the keeper through the real pipeline: the keeper lines
 * up while the player aims and charges, reads the kick and moves step by step
 * with Rapier, and the outcome tracker decides. `random` drives the aim wobble
 * and the keeper's choices; the default always reads the shot, without error.
 */
function play(aimX: number, aimY: number, power: number, curl = 0, random = () => 0.5) {
  keeper.reset();
  physics.resetBall();
  outcome.reset();
  keeper.aimX = aimX;
  keeper.set = false;
  for (let t = 0; t < 1; t += FIXED_STEP) keeper.step(FIXED_STEP);
  keeper.set = true;
  for (let t = 0; t < 0.5; t += FIXED_STEP) keeper.step(FIXED_STEP);
  physics.poseKeeper(rig.parts, true);

  const shot = shapeShot({ aim: { x: aimX, y: aimY, z: 0 }, power, curl, minTargetY: world.ballRadius }, random);
  const velocity = solveKick(world.ballStart, shot.target, shot.speed, shot.spin);
  physics.kick(velocity, shot.spin);
  const kick = { start: world.ballStart, velocity, spin: shot.spin };
  keeper.react(readShot(kick, keeper.lineZ, world.goal, keeper.skill, random));

  const contacts: Contact[] = [];
  let maxZAfterKeeper = -Infinity;
  for (let t = 0; t < 6; t += FIXED_STEP) {
    keeper.step(FIXED_STEP);
    physics.poseKeeper(rig.parts);
    physics.step();
    for (const c of physics.takeContacts()) {
      contacts.push(c);
      if (c.surface === 'keeper') outcome.keeperTouched(c.point.z);
    }
    const p = physics.ball.translation();
    const v = physics.ball.linvel();
    if (outcome.hitKeeper) maxZAfterKeeper = Math.max(maxZAfterKeeper, p.z);
    const result = outcome.update(p, Math.hypot(v.x, v.y, v.z), FIXED_STEP);
    if (result) return { result, contacts, maxZAfterKeeper };
  }
  return { result: null, contacts, maxZAfterKeeper };
}

describe('shots against the keeper', () => {
  it('saves a shot hit at it, and the ball comes back out', () => {
    const r = play(0, 0.9, 0.7);
    expect(r.result).toBe('saved');
    expect(r.contacts.some((c) => c.surface === 'keeper')).toBe(true);
    expect(r.maxZAfterKeeper).toBeGreaterThan(home.z + 0.4);
  });

  it('saves soft shots, even toward a corner', () => {
    expect(play(2.1, 0.9, 0.4).result).toBe('saved');
    expect(play(-2.1, 0.35, 0.4).result).toBe('saved');
  });

  it('lets a perfect strike into the corner beat it', () => {
    expect(play(2.45, 0.35, 0.87).result).toBe('goal');
    expect(play(-2.45, 1.6, 0.87).result).toBe('goal');
  });

  it('is fooled by curl on a shot it saves when hit straight', () => {
    // Dragging left swings the ball out toward the middle, then it bends right, away from the keeper.
    expect(play(1.6, 0.9, 0.8, 0).result).toBe('saved');
    expect(play(1.6, 0.9, 0.8, -1).result).toBe('goal');
  });
});

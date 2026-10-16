import { describe, expect, it } from 'vitest';
import { solveKick } from '../physics/flight';
import { KEEPER_BODY, keeperParts } from '../physics/keeperBody';
import type { GoalConfig } from '../worldConfig';
import { KEEPER_SKILLS, readShot, type KeeperSkill } from './keeper';
import { KeeperMotion, lowestPivot } from './keeperMotion';

const goal: GoalConfig = {
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
};
const start = { x: 0, y: 0.175, z: 12.4 };
const line = 0.55;
const sure: KeeperSkill = { ...KEEPER_SKILLS.normal, read: 1, misjudge: 0 };

function kick(x: number, y: number, curl: number, speed = 26) {
  const spin = { x: 0, y: -curl * 55, z: 0 };
  return { start, velocity: solveKick(start, { x, y, z: 0 }, speed, spin), spin };
}

describe('readShot', () => {
  it('reads a straight shot to where it goes', () => {
    const read = readShot(kick(1.5, 1, 0), line, goal, sure);
    expect(read.read).toBe(true);
    expect(read.time).toBeGreaterThan(0.4);
    expect(read.time).toBeLessThan(0.6);
    const spot = read.spot(0.2);
    expect(spot.x).toBeCloseTo(1.5 * (1 - line / 12.4), 1);
    expect(spot.y).toBeGreaterThan(0.8);
    expect(spot.y).toBeLessThan(1.2);
  });

  it('is fooled by curl unless it senses it, and sees more of the bend the longer it watches', () => {
    // Curled into the right corner: the ball starts out left of where it ends up.
    const curled = kick(2.3, 1.2, 1);
    const blind = readShot(curled, line, goal, { ...sure, curlSense: 0 });
    const sharp = readShot(curled, line, goal, { ...sure, curlSense: 1 });
    expect(sharp.spot(0.1).x).toBeGreaterThan(1.8);
    expect(blind.spot(0.1).x).toBeLessThan(sharp.spot(0.1).x - 0.6);
    expect(blind.spot(0.3).x).toBeGreaterThan(blind.spot(0.1).x + 0.3);
  });

  it('misjudges hard shots more than soft ones', () => {
    const spread = (speed: number) => {
      const xs = Array.from({ length: 200 }, (_, i) => {
        const r = [0, (i * 0.618) % 1, (i * 0.414) % 1];
        let n = 0;
        const read = readShot(kick(0.8, 1, 0, speed), line, goal, { ...sure, misjudge: 0.6 }, () => r[n++ % 3]);
        return read.spot(0.2).x;
      });
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(29)).toBeGreaterThan(spread(17) * 2);
  });

  it('guesses a side when it does not read the shot', () => {
    const picks = [0.01, 0.5, 0.99].map((side) => {
      const r = [0.01, side, 0.5];
      let n = 0;
      return readShot(kick(2, 1, 0, 30), line, goal, { ...sure, read: 0.5 }, () => r[n++]);
    });
    expect(picks.map((p) => p.read)).toEqual([false, false, false]);
    expect(picks[0].spot(0).x).toBeLessThan(-2);
    expect(picks[1].spot(0).x).toBe(0);
    expect(picks[2].spot(0).x).toBeGreaterThan(2);
  });

  it('always reads a slow shot', () => {
    const slow = kick(2, 1, 0, 17);
    const reads = Array.from({ length: 20 }, (_, i) => readShot(slow, line, goal, { ...sure, read: 0 }, () => i / 20));
    expect(reads.every((r) => r.read)).toBe(true);
  });
});

describe('KeeperMotion', () => {
  const home = { x: 0, y: 0, z: 0.35 };
  const spotAt = (x: number, y: number, time: number) => ({ time, read: true, spot: () => ({ x, y }) });
  const run = (motion: KeeperMotion, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 120) motion.step(1 / 120);
  };
  const reachOf = (motion: KeeperMotion) => {
    const arms = keeperParts(motion.pose).arms;
    return { x: (arms[0].glove.x + arms[1].glove.x) / 2, y: (arms[0].glove.y + arms[1].glove.y) / 2 };
  };

  it('edges toward the aim while waiting, then gets set', () => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.normal);
    motion.aimX = 2;
    run(motion, 2);
    expect(motion.pose.pivot.x).toBeCloseTo(2 * KEEPER_SKILLS.normal.lean, 1);
    motion.set = true;
    run(motion, 1);
    expect(motion.pose.crouch).toBeGreaterThan(0.3);
    expect(motion.pose.pivot.y).toBeCloseTo(0, 2);
  });

  it('waits for its reaction time before moving', () => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.normal);
    motion.react(spotAt(2.2, 0.5, 0));
    run(motion, KEEPER_SKILLS.normal.reaction - 0.02);
    expect(motion.pose.pivot.x).toBeCloseTo(0, 5);
    run(motion, 0.1);
    expect(motion.pose.pivot.x).toBeGreaterThan(0.1);
  });

  it.each([
    ['low', 1.9, 0.4],
    ['mid', -1.8, 1],
    ['high', 1.6, 1.6],
    ['close', 0.5, 1.1],
  ])('gets its gloves to a %s ball within reach, in time', (_, x, y) => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.hard);
    motion.react(spotAt(x, y, 0.9));
    run(motion, 0.9);
    const reach = reachOf(motion);
    expect(Math.hypot(reach.x - x, reach.y - y)).toBeLessThan(0.15);
  });

  it('waits for a slow ball instead of diving too early', () => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.hard);
    motion.react(spotAt(2, 0.8, 1.5));
    run(motion, 0.6);
    expect(motion.pose.pivot.x).toBeCloseTo(0, 5);
  });

  it('cannot reach the far top corner from the middle', () => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.normal);
    motion.react(spotAt(2.65, 1.75, 0));
    let best = Infinity;
    for (let t = 0; t < 1; t += 1 / 120) {
      motion.step(1 / 120);
      const r = reachOf(motion);
      best = Math.min(best, Math.hypot(r.x - 2.65, r.y - 1.75));
    }
    expect(best).toBeGreaterThan(KEEPER_BODY.glove.radius + 0.175);
  });

  it('never sinks into the grass, and lands lying down after a dive', () => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.hard);
    motion.react(spotAt(-2.6, 0.25, 0));
    for (let t = 0; t < 1.5; t += 1 / 120) {
      motion.step(1 / 120);
      expect(motion.pose.pivot.y).toBeGreaterThanOrEqual(lowestPivot(motion.pose.tilt) - 1e-6);
    }
    expect(motion.pose.tilt).toBeLessThan(-1.3);
  });

  it('gets back up and into the middle when it recovers', () => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.normal);
    motion.react(spotAt(-2.2, 0.4, 0));
    run(motion, 1.2);
    expect(motion.pose.tilt).toBeLessThan(-1);
    motion.recover();
    run(motion, 0.2);
    expect(motion.pose.tilt).toBeLessThan(-0.1);
    run(motion, 0.4);
    expect(motion.pose.tilt).toBeCloseTo(0, 5);
    expect(motion.pose.pivot.x).toBeCloseTo(0, 5);
    expect(motion.moving).toBe(false);
  });

  it('goes back to standing in the middle on reset', () => {
    const motion = new KeeperMotion(home, KEEPER_SKILLS.normal);
    motion.react(spotAt(2, 1, 0));
    run(motion, 1);
    motion.reset();
    expect(motion.pose.pivot).toEqual(home);
    expect(motion.pose.tilt).toBe(0);
    expect(motion.moving).toBe(false);
  });
});

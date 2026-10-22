import { describe, expect, it } from 'vitest';
import { solveKick } from '../physics/flight';
import { loadKeeperRig } from '../testing/loadKeeper';
import type { GoalConfig } from '../worldConfig';
import { KEEPER_SKILL, readShot, type KeeperSkill } from './keeper';
import { KeeperMotion } from './keeperMotion';

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
const sure: KeeperSkill = { ...KEEPER_SKILL, read: 1, misjudge: 0 };

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

describe('KeeperMotion', async () => {
  const home = { x: 0, y: 0, z: 0.35 };
  const rig = await loadKeeperRig();
  const spotAt = (x: number, y: number, time: number, speed = 20) => ({
    time,
    speed,
    read: true,
    spot: () => ({ x, y }),
  });
  const fresh = () => new KeeperMotion(home, KEEPER_SKILL, rig);
  const run = (motion: KeeperMotion, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 120) motion.step(1 / 120);
  };
  /** How far the ball at (x, y) is from the line between the gloves' centres. */
  const glovesTo = (x: number, y: number) => {
    const [a, b] = [rig.partCentre(0), rig.partCentre(1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const k = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - dx * k, y - a.y - dy * k);
  };

  it('stands at ease until you aim, then gets ready', () => {
    const motion = fresh();
    run(motion, 0.5);
    expect(rig.playing).toBe('idle');
    motion.aimX = 0;
    run(motion, 0.5);
    expect(rig.playing).toBe('ready');
  });

  it.each([
    [2, 'shuffle_L'],
    [-2, 'shuffle_R'],
  ])('steps across toward where you aim (%s)', (aimX, clip) => {
    const motion = fresh();
    motion.aimX = aimX;
    run(motion, 0.2);
    expect(rig.playing).toBe(clip);
    run(motion, 3);
    expect(rig.object.position.x).toBeCloseTo(aimX * KEEPER_SKILL.lean, 1);
    expect(rig.playing).toBe('ready');
  });

  it('waits for its reaction time before moving', () => {
    const motion = fresh();
    motion.react(spotAt(2.2, 0.5, 0.6));
    run(motion, KEEPER_SKILL.reaction - 0.02);
    expect(rig.playing).toBe('idle');
    expect(rig.object.position.x).toBe(0);
    run(motion, 0.1);
    expect(rig.playing).toBe('dive_low_L');
    expect(rig.object.position.x).toBeGreaterThan(0);
  });

  it.each([
    ['a hard shot at it', 0.2, 0.9, 28, 'punch'],
    ['a soft shot at it', -0.2, 0.7, 16, 'catch_chest'],
    ['a ball over its head', 0.1, 1.7, 22, 'tuck_jump'],
    ['a low ball to its left', 1.6, 0.3, 22, 'dive_low_L'],
    ['a high ball to its right', -1.5, 1.5, 22, 'dive_high_R'],
  ])('picks the save for %s', (_, x, y, speed, clip) => {
    const motion = fresh();
    motion.react(spotAt(x, y, 0.6, speed));
    run(motion, 0.6);
    expect(rig.playing).toBe(clip);
  });

  it.each([
    ['low', 1.6, 0.4],
    ['mid', -1.8, 1],
    ['high', 1.6, 1.6],
    ['close', 0.4, 1.1],
  ])('gets its gloves to a %s ball within reach, in time', (_, x, y) => {
    const motion = fresh();
    motion.react(spotAt(x, y, 0.9));
    run(motion, 0.9);
    expect(glovesTo(x, y)).toBeLessThan(rig.shapes[0].radius);
  });

  it('waits for a slow ball instead of diving too early', () => {
    const motion = fresh();
    motion.react(spotAt(2, 0.8, 1.5));
    run(motion, 0.6);
    expect(rig.playing).toBe('idle');
    expect(rig.object.position.x).toBe(0);
  });

  it('cannot reach the top corner of a hard shot from the middle', () => {
    const motion = fresh();
    motion.react(spotAt(2.65, 1.75, 0.45, 28));
    let best = Infinity;
    for (let t = 0; t < 1; t += 1 / 120) {
      motion.step(1 / 120);
      best = Math.min(best, glovesTo(2.65, 1.75));
    }
    expect(best).toBeGreaterThan(rig.shapes[0].radius + 0.175);
  });

  it('dives without sinking into the grass, and ends lying on it', () => {
    const motion = fresh();
    motion.react(spotAt(-2.4, 0.25, 0.5));
    for (let t = 0; t < 1.6; t += 1 / 120) {
      motion.step(1 / 120);
      expect(rig.object.position.y).toBeGreaterThanOrEqual(-0.15);
    }
    const body = rig.shapes.findIndex((s) => s.name === 'chest');
    expect(rig.partCentre(body).y).toBeLessThan(0.45);
    expect(rig.partCentre(body).x).toBeLessThan(-1);
  });

  it('celebrates, and goes back to standing in the middle on reset', () => {
    const motion = fresh();
    motion.react(spotAt(2, 1, 0.5));
    run(motion, 1);
    motion.celebrate();
    run(motion, 1);
    expect(rig.playing).toBe('celebrate');
    motion.reset();
    expect(rig.object.position.toArray()).toEqual([home.x, home.y, home.z]);
    expect(rig.playing).toBe('idle');
    expect(motion.moving).toBe(false);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WorldConfig } from '../worldConfig';
import { BallTrail } from './ball';
import { BallAura } from './ballAura';
import type { BallFade } from './ballFade';
import type { Effects } from './effects';
import type { KeeperRig } from './keeperRig';
import { Replay } from './replay';

/** Writes down what the replay asks of its dust and glitter, with the game time it has moved them on to. */
function fakeEffects() {
  const calls: { what: string; at: number }[] = [];
  let at = 0; // game seconds since the replay's kick
  let glitterTime = 0; // game seconds of sparkles asked for
  const effects = {
    group: new THREE.Group(),
    kickPuff: () => calls.push({ what: 'kick', at }),
    skim: () => calls.push({ what: 'skim', at }),
    glitterTrail: (_at: unknown, dt: number) => {
      glitterTime += dt;
      calls.push({ what: 'glitter', at });
    },
    update: (dt: number) => (at += dt),
    clear: () => calls.push({ what: 'clear', at }),
    setViewportHeight: () => {},
  };
  return { effects, calls, time: () => at, glitterTime: () => glitterTime };
}

function setUp() {
  const fx = fakeEffects();
  const ball = new THREE.Object3D();
  const replay = new Replay({
    world: { ballStart: { x: 0, y: 0.175, z: 12.4 }, groundY: 0, goal: { lineZ: 0 } } as unknown as WorldConfig,
    renderer: { setRenderTarget() {}, render() {}, getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer,
    scene: new THREE.Scene(),
    ball,
    ballFade: { shown: 1, showAt() {}, reset() {} } as unknown as BallFade,
    keeper: { snapshotSize: 1, snapshot: (out: Float32Array) => out, apply() {} } as unknown as KeeperRig,
    trail: new BallTrail(),
    aura: new BallAura(0.175),
    hide: [],
    effects: fx.effects as unknown as Effects,
    crowd: { clock: 0, show() {} },
  });
  replay.resize(800, 450);
  return { replay, fx };
}

/** A shot kicked at game time 10, flying 1.2 s at 10 m/s, decided at 11.0. */
function recordShot(replay: Replay, perfect: boolean) {
  replay.begin(10, { power: 0.8, perfect });
  for (let t = 10 + 1 / 60; t <= 11.2; t += 1 / 60) {
    replay.record(t, { x: 0, y: 0.175, z: 12.4 - (t - 10) * 10 }, { x: 0, y: 0, z: 0, w: 1 });
    if (t >= 11) replay.recorder.markResult(t);
  }
}

describe('replay', () => {
  it('makes the kick dust, grass puffs and perfect-strike glitter again, on game time', () => {
    const { replay, fx } = setUp();
    recordShot(replay, true);
    replay.start(true);
    expect(fx.effects.group.visible).toBe(true);
    expect(fx.calls.filter((c) => c.what === 'kick')).toHaveLength(1);
    while (!replay.finished) replay.render(1 / 60);

    // The dust moves on in game time (here from the kick), so in the slowed-down replay it keeps up with the ball.
    expect(fx.time()).toBeGreaterThan(1);
    // Glitter and puffs only while the ball flies, like in the game: not after the result.
    const glitter = fx.calls.filter((c) => c.what === 'glitter');
    expect(glitter.length).toBeGreaterThan(30);
    expect(Math.max(...glitter.map((c) => c.at))).toBeLessThan(1);
    expect(fx.glitterTime()).toBeCloseTo(1, 1); // as many sparkles as the game made in its second of flight
    expect(fx.calls.filter((c) => c.what === 'skim').length).toBe(glitter.length);

    replay.stop();
    expect(fx.calls[fx.calls.length - 1].what).toBe('clear');
    expect(fx.effects.group.visible).toBe(false);
  });

  it('has no glitter when the strike was not perfect', () => {
    const { replay, fx } = setUp();
    recordShot(replay, false);
    replay.start(false);
    while (!replay.finished) replay.render(1 / 60);
    expect(fx.calls.some((c) => c.what === 'glitter')).toBe(false);
    expect(fx.calls.some((c) => c.what === 'kick')).toBe(true);
  });
});

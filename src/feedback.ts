import type { Sound } from './audio/sound';
import type { GameEvents } from './gameplay/events';
import type { SlowMotion } from './gameplay/slowMotion';
import type { Effects } from './scene/effects';
import type { NetRipple } from './scene/netRipple';
import type { Hud } from './ui/hud';
import type { WorldConfig } from './worldConfig';

export interface FeedbackParts {
  world: WorldConfig;
  camera: { addTrauma(amount: number): void };
  sound: Sound;
  effects: Effects;
  net: NetRipple;
  hud: Hud;
  slowMotion: SlowMotion;
}

// Touches softer than these (m/s) make no sound or ripple.
const NET_SPEED = 2;
const WOODWORK_SPEED = 1.5;
const BOUNCE_SPEED = 1.2; // downward speed onto the grass
// After a touch, the same surface stays quiet this long (ms) unless it's hit much harder.
const QUIET_MS = 150;

/** Connects game moments to what the player sees, hears and feels. */
export function connectFeedback(events: GameEvents, f: FeedbackParts) {
  const last = new Map<string, { at: number; speed: number }>();
  /** True if this touch should make itself felt (not an echo of the one just before). */
  const fresh = (surface: string, speed: number) => {
    const now = performance.now();
    const prev = last.get(surface);
    if (prev && now - prev.at < QUIET_MS && speed < prev.speed * 1.5) return false;
    last.set(surface, { at: now, speed });
    return true;
  };

  events.on('kick', ({ power, quality }) => {
    f.camera.addTrauma(0.12 + 0.18 * power);
    f.sound.kick(power);
    f.effects.kickPuff(f.world.ballStart, f.world.groundY, power);
    if (quality === 'perfect') {
      f.camera.addTrauma(0.15);
      f.sound.perfect();
      f.hud.popWord('PERFECT!');
    }
  });

  events.on('contact', ({ surface, point, velocity, speed }) => {
    if (surface === 'net' && speed > NET_SPEED && fresh(surface, speed)) {
      const r = f.world.ballRadius / speed; // from the ball's centre to where it meets the net
      const dir = { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed };
      const at = { x: point.x + velocity.x * r, y: point.y + velocity.y * r, z: point.z + velocity.z * r };
      f.net.hit(at, dir, Math.min(0.32, speed * 0.013));
      f.sound.net(speed / 22);
    } else if (surface === 'woodwork' && speed > WOODWORK_SPEED && fresh(surface, speed)) {
      f.sound.woodwork(speed / 25);
      f.camera.addTrauma(Math.min(0.65, 0.25 + speed * 0.016));
    } else if (surface === 'ground' && -velocity.y > BOUNCE_SPEED && fresh(surface, -velocity.y)) {
      f.sound.bounce(-velocity.y / 9);
    }
  });

  events.on('result', ({ result, quality, woodwork, streak }) => {
    if (result === 'goal') {
      const big = quality === 'perfect' || streak >= 3;
      f.slowMotion.trigger(0.3, 0.35, 0.6);
      f.camera.addTrauma(big ? 0.5 : 0.35);
      f.effects.celebrate(f.world.goal, f.world.groundY, quality === 'perfect');
      f.sound.cheer(big);
    } else {
      f.sound.groan(woodwork ? 0.9 : 0.45);
    }
  });
}

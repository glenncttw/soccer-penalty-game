import type { GameEvents } from './gameplay/events';
import type { SlowMotion } from './gameplay/slowMotion';
import type { Effects } from './scene/effects';
import type { Hud } from './ui/hud';
import type { WorldConfig } from './worldConfig';

export interface FeedbackParts {
  world: WorldConfig;
  camera: { addTrauma(amount: number): void };
  effects: Effects;
  hud: Hud;
  slowMotion: SlowMotion;
}

// Touches softer than these (m/s) don't shake the camera.
const WOODWORK_SPEED = 1.5;
const KEEPER_SPEED = 1.5;
// After a touch, the same surface stays quiet this long (ms) unless it's hit much harder.
const QUIET_MS = 150;

/** Connects game moments to what the player sees and feels. */
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
    f.effects.kickPuff(f.world.ballStart, f.world.groundY, power);
    if (quality === 'perfect') {
      f.camera.addTrauma(0.15);
      f.hud.popWord('PERFECT!');
    }
  });

  events.on('contact', ({ surface, speed }) => {
    if (surface === 'woodwork' && speed > WOODWORK_SPEED && fresh(surface, speed)) {
      f.camera.addTrauma(Math.min(0.65, 0.25 + speed * 0.016));
    } else if (surface === 'keeper' && speed > KEEPER_SPEED && fresh(surface, speed)) {
      f.camera.addTrauma(Math.min(0.5, 0.15 + speed * 0.012));
    }
  });

  events.on('result', ({ result, quality }) => {
    if (result === 'goal') {
      f.slowMotion.trigger(0.3, 0.35, 0.6);
      f.camera.addTrauma(quality === 'perfect' ? 0.5 : 0.35);
    }
  });
}

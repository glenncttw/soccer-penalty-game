import type { Contact } from '../physics/world';
import type { ShotResult } from './outcome';
import type { StrikeQuality } from './power';

/**
 * Everything that happens during a shot, in order. Gameplay emits these; the
 * camera, effects and HUD listen, so each stays independent of the others.
 */
export interface GameEventMap {
  /** The ball was struck. */
  kick: { power: number; quality: StrikeQuality };
  /** The ball touched the ground, the woodwork, the net or the keeper. */
  contact: Contact;
  /** The shot is decided. */
  result: { result: ShotResult; quality: StrikeQuality; woodwork: boolean };
}

type Listener<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

export class GameEvents {
  private readonly listeners = new Map<keyof GameEventMap, Set<Listener<never>>>();

  /** Calls `listener` every time `type` happens. Returns a function that stops listening. */
  on<K extends keyof GameEventMap>(type: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]) {
    for (const listener of this.listeners.get(type) ?? []) (listener as Listener<K>)(payload);
  }
}

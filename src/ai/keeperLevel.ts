import type { KeeperLevel } from './keeper';

const LEVEL_KEY = 'penalty:keeper';
const LEVELS: KeeperLevel[] = ['easy', 'normal', 'hard'];

/** The keeper level the player picked last time on this device, or normal. */
export function loadKeeperLevel(): KeeperLevel {
  try {
    const saved = localStorage.getItem(LEVEL_KEY);
    return LEVELS.find((level) => level === saved) ?? 'normal';
  } catch {
    return 'normal';
  }
}

export function saveKeeperLevel(level: KeeperLevel) {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch {
    // storage can be blocked (private mode); the level then lasts for this visit only
  }
}

/** easy → normal → hard → easy */
export function nextKeeperLevel(level: KeeperLevel): KeeperLevel {
  return LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
}

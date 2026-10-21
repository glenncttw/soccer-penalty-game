/** How each shot of a round ended. Off the woodwork and out counts as a miss. */
export type ShotOutcome = 'goal' | 'saved' | 'miss';

/** Penalties in one round of the Croky Cup. */
export const ROUND_SHOTS = 5;

/** One round: a few penalties, and how each one went. */
export class Round {
  readonly results: ShotOutcome[] = [];

  constructor(readonly shots = ROUND_SHOTS) {}

  /** Writes down how a shot ended (ignored once the round is over). */
  record(outcome: ShotOutcome) {
    if (!this.over) this.results.push(outcome);
  }

  get goals() {
    return this.results.filter((r) => r === 'goal').length;
  }

  /** True once every penalty has been taken. */
  get over() {
    return this.results.length >= this.shots;
  }

  reset() {
    this.results.length = 0;
  }
}

const BEST_KEY = 'crokycup:best';

/** The most goals scored in a round on this device, or null before the first round. */
export function readBest(): number | null {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return localStorage.getItem(BEST_KEY) === null || Number.isNaN(v) ? null : v;
  } catch {
    return null; // storage can be blocked (private mode)
  }
}

/** Remembers `goals` if it beats the best so far. */
export function saveBest(goals: number) {
  const best = readBest();
  if (best !== null && best >= goals) return;
  try {
    localStorage.setItem(BEST_KEY, String(goals));
  } catch {
    // storage can be blocked (private mode); then there's just no best score next visit
  }
}

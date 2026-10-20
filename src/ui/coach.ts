/**
 * First-visit tips that follow what the player is doing, one step at a time,
 * so each instruction shows up when it's needed. Once the player has curled a
 * shot (or taken three), the tips stop for good on this device.
 */
export type CoachTip = 'aim' | 'curl' | 'release' | null;

export const COACH_TEXT: Record<Exclude<CoachTip, null>, string> = {
  aim: 'Point at a spot in the goal, then press and hold',
  curl: 'Drag sideways to curl it past the keeper · let go in the gold zone',
  release: 'Nice curl! Let go when the bar is in the gold zone',
};

/** The same tips for someone playing with the keyboard. */
export const COACH_KEY_TEXT: Record<Exclude<CoachTip, null>, string> = {
  aim: 'Arrow keys to aim, then hold Space',
  curl: '← → to curl it past the keeper · let go of Space in the gold zone',
  release: 'Nice curl! Let go of Space when the bar is in the gold zone',
};

/** The first tip on a computer, before the player has picked the mouse or the keys. */
export const COACH_AIM_EITHER = 'Point at a spot in the goal, then press and hold · or use the arrow keys and Space';

const DONE_KEY = 'penalty:coached';
const CURL_NOTICED = 0.35; // how much drag counts as "curled"

export class Coach {
  done: boolean;
  private shots = 0;
  private curled = false;

  constructor(done = readDone()) {
    this.done = done;
  }

  /** The tip for this moment; `curl` is the current drag (-1..1). */
  update(phase: 'aiming' | 'charging' | 'flight' | 'result', curl: number): CoachTip {
    if (this.done) return null;
    if (phase === 'aiming') return 'aim';
    if (phase !== 'charging') return null;
    if (Math.abs(curl) > CURL_NOTICED) this.curled = true;
    return this.curled ? 'release' : 'curl';
  }

  shotTaken() {
    this.shots++;
    if (this.done || (!this.curled && this.shots < 3)) return;
    this.done = true;
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      // storage can be blocked (private mode); then the tips just come back next visit
    }
  }
}

function readDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

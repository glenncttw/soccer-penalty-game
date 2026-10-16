/**
 * The power meter sweeps up and down while the player holds. Releasing inside
 * the gold zone gives a perfect strike; too much power skies the ball, too
 * little makes a soft, easy shot.
 */
export const POWER_MIN = 0.15;
export const PERFECT_MIN = 0.82;
export const PERFECT_MAX = 0.92;
const SWEEP_SECONDS = 0.9; // time to go from empty to full

export class PowerMeter {
  value = POWER_MIN;
  private direction = 1;
  sweeps = 0;

  reset() {
    this.value = POWER_MIN;
    this.direction = 1;
    this.sweeps = 0;
  }

  update(dt: number) {
    this.value += (this.direction * dt) / SWEEP_SECONDS;
    if (this.value >= 1) {
      this.value = 1;
      this.direction = -1;
    } else if (this.value <= POWER_MIN) {
      this.value = POWER_MIN;
      this.direction = 1;
      this.sweeps++;
    }
  }
}

export type StrikeQuality = 'perfect' | 'good' | 'weak' | 'skied';

export function strikeQuality(power: number): StrikeQuality {
  if (power >= PERFECT_MIN && power <= PERFECT_MAX) return 'perfect';
  if (power > PERFECT_MAX) return 'skied';
  if (power < 0.5) return 'weak';
  return 'good';
}

import { describe, expect, it } from 'vitest';
import { onArch } from './screens';

describe('the title arch', () => {
  it('is highest in the middle, as much lower at both ends, and turns the letters along it', () => {
    const half = 2.9; // the title is about 5.8 letter heights wide
    const rise = 22 / 135;
    expect(onArch(0, half, rise)).toEqual({ drop: 0, turn: 0 });
    const left = onArch(-half, half, rise);
    const right = onArch(half, half, rise);
    expect(left.drop).toBeCloseTo(rise, 9);
    expect(right.drop).toBeCloseTo(rise, 9);
    expect(right.turn).toBeCloseTo(-left.turn, 9);
    expect(right.turn).toBeGreaterThan(5); // clockwise on the right, so the ends go down
    expect(right.turn).toBeLessThan(8); // just a little
    // Lower and more turned the further out a letter is.
    expect(onArch(1, half, rise).drop).toBeLessThan(onArch(2, half, rise).drop);
    expect(onArch(1, half, rise).turn).toBeLessThan(onArch(2, half, rise).turn);
  });
});

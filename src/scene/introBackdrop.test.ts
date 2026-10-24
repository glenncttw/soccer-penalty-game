import { describe, expect, it } from 'vitest';
import { holeRadius } from './introBackdrop';

describe('holeRadius', () => {
  it('shows no hole, not even its soft edge, before the purple starts to go', () => {
    expect(holeRadius(0, 640, 400, 1280, 720, 6) + 6).toBeLessThan(0);
  });

  it('grows past the furthest corner, edge and all, on wide and upright screens', () => {
    for (const [x, y, w, h] of [
      [640, 400, 1280, 720],
      [195, 300, 390, 844],
      [100, 50, 844, 390], // the ball off to one side
    ]) {
      const r = holeRadius(1, x, y, w, h, 6);
      for (const [cx, cy] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ]) {
        expect(Math.hypot(cx - x, cy - y) + 6).toBeLessThan(r);
      }
      expect(holeRadius(0.5, x, y, w, h, 6)).toBeLessThan(r);
    }
  });
});

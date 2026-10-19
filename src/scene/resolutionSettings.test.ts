import { describe, expect, it } from 'vitest';
import { clampPixelRatio, pickPixelRatio, RESOLUTION_SETTINGS } from './resolutionSettings';

describe('pickPixelRatio', () => {
  it('uses the desktop cap on a computer', () => {
    expect(pickPixelRatio(2, false)).toBe(1.5);
    expect(pickPixelRatio(1, false)).toBe(1);
  });

  it('uses the chosen phone preset on a touch screen', () => {
    for (const preset of ['high', 'balanced', 'performance'] as const) {
      const settings = { ...RESOLUTION_SETTINGS, mobilePreset: preset };
      expect(pickPixelRatio(3, true, settings)).toBe(settings.mobilePresets[preset]);
    }
  });

  it("never draws more pixels than the screen's own", () => {
    expect(pickPixelRatio(1, true)).toBe(1);
    expect(pickPixelRatio(1.25, false)).toBe(1.25);
    expect(clampPixelRatio(2, 1.5)).toBe(1.5);
    expect(clampPixelRatio(2, 0)).toBe(1); // a browser that reports nothing counts as 1
  });
});

import { describe, expect, it } from 'vitest';
import { fogFarFor, halvedSizes, whiteBalance } from './renderPipeline';
import { BASELINE_RENDER_SETTINGS, RENDER_PRESETS, RENDER_SETTINGS } from './renderSettings';

// three.js's fog: a smoothstep from near to far.
function fogAt(distance: number, near: number, far: number) {
  const t = Math.min(Math.max((distance - near) / (far - near), 0), 1);
  return t * t * (3 - 2 * t);
}

describe('fogFarFor', () => {
  it('makes the fog reach the asked amount at the end distance', () => {
    for (const amount of [0.05, 0.15, 0.5, 0.9]) {
      const far = fogFarFor(20, 40, amount);
      expect(fogAt(40, 20, far)).toBeCloseTo(amount, 6);
    }
  });

  it('leaves everything before the start clear', () => {
    expect(fogAt(19, 20, fogFarFor(20, 40, 0.15))).toBe(0);
  });

  it('puts the end at far for a full amount', () => {
    expect(fogFarFor(20, 40, 1)).toBeCloseTo(40, 6);
  });
});

describe('halvedSizes', () => {
  it('halves the size each level, starting at half', () => {
    expect(halvedSizes(1280, 720, 5)).toEqual([
      [640, 360],
      [320, 180],
      [160, 90],
      [80, 45],
      [40, 23],
    ]);
  });

  it('never goes below one pixel', () => {
    expect(halvedSizes(10, 4, 5).at(-1)).toEqual([1, 1]);
  });
});

describe('whiteBalance', () => {
  it('changes nothing at warmth 0', () => {
    expect(whiteBalance(0).toArray()).toEqual([1, 1, 1]);
  });

  it('shifts the colour without changing the brightness', () => {
    for (const warmth of [-0.2, 0.1]) {
      const wb = whiteBalance(warmth);
      expect(0.2126 * wb.x + 0.7152 * wb.y + 0.0722 * wb.z).toBeCloseTo(1, 6);
    }
    expect(whiteBalance(0.1).x).toBeGreaterThan(whiteBalance(0.1).z); // warmer = more red than blue
  });
});

describe('render presets', () => {
  it('has a baseline without tone mapping, grading or effects, and the game look', () => {
    expect(RENDER_PRESETS.Polished).toBe(RENDER_SETTINGS);
    const b = BASELINE_RENDER_SETTINGS;
    expect([b.toneMapping, b.exposure, b.saturation, b.contrast, b.shadowLift]).toEqual(['none', 1, 1, 1, 0]);
    expect([b.bloom, b.depthOfField, b.atmosphere, b.grain]).toEqual([false, false, 0, 0]);
  });
});

import { describe, expect, it } from 'vitest';
import { AutoResolution, type AutoMemory } from './autoResolution';
import { RESOLUTION_SETTINGS } from './resolutionSettings';

const SETTINGS = RESOLUTION_SETTINGS.autoSettings;

function make(start = 1.25, memory: AutoMemory | null = null, screen = 3, now = 0) {
  const saved: AutoMemory[] = [];
  const auto = new AutoResolution(SETTINGS, start, screen, memory, (m) => saved.push(m), now);
  return { auto, saved };
}

/** Aims for long enough to measure once, with frames `ms` apart. */
function aim(auto: AutoResolution, ms: number, t = { now: 0 }) {
  const seconds = SETTINGS.settle + SETTINGS.measure + 0.5;
  for (let i = 0; i < (seconds * 1000) / ms; i++) auto.frame((t.now += ms), true);
}

describe('AutoResolution', () => {
  it('steps down on a slow phone, but only behind the wipe', () => {
    const { auto, saved } = make();
    aim(auto, 1000 / 45);
    expect(auto.ratio).toBe(1.25); // nothing changes while aiming
    expect(auto.pending).toBe(1);
    expect(auto.applyPending()).toBe(true);
    expect(auto.ratio).toBe(1);
    expect(saved.at(-1)).toMatchObject({ ratio: 1, ceiling: 1.25 });
  });

  it('tries a sharper step with room to spare, and goes back if it is too slow there', () => {
    const { auto, saved } = make();
    aim(auto, 1000 / 60);
    expect(auto.pending).toBe(1.5);
    auto.applyPending();
    aim(auto, 1000 / 50);
    expect(auto.pending).toBe(1.25);
    auto.applyPending();
    expect(auto.ratio).toBe(1.25);
    expect(saved.at(-1)).toMatchObject({ ratio: 1.25, ceiling: 1.5 });
    // Done for this visit.
    aim(auto, 1000 / 60);
    expect(auto.pending).toBeNull();
  });

  it('keeps the sharper step when it stays smooth', () => {
    const { auto, saved } = make();
    aim(auto, 1000 / 60);
    auto.applyPending();
    aim(auto, 1000 / 60);
    expect(auto.pending).toBeNull();
    expect(saved.at(-1)).toMatchObject({ ratio: 1.5, ceiling: null });
  });

  it('stays put when it is nearly smooth', () => {
    const { auto, saved } = make();
    aim(auto, 1000 / 57.8);
    expect(auto.pending).toBeNull();
    expect(saved.at(-1)?.ratio).toBe(1.25);
  });

  it('leaves a frame rate held at 30 alone (Low Power Mode)', () => {
    const { auto, saved } = make();
    aim(auto, 1000 / 30);
    expect(auto.pending).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('starts from what it remembered, and does not retry a step found too slow', () => {
    const { auto } = make(1.25, { ratio: 1.25, ceiling: 1.5, ceilingAt: 0 }, 3, 1000);
    aim(auto, 1000 / 60);
    expect(auto.pending).toBeNull();
  });

  it('tries that step again after a few days', () => {
    const later = (SETTINGS.ceilingDays + 1) * 86_400_000;
    const { auto } = make(1.25, { ratio: 1.25, ceiling: 1.5, ceilingAt: 0 }, 3, later);
    aim(auto, 1000 / 60);
    expect(auto.pending).toBe(1.5);
  });

  it("never goes above the screen's own pixel ratio", () => {
    const { auto } = make(1.25, null, 1.25);
    aim(auto, 1000 / 60);
    expect(auto.pending).toBeNull();
  });

  it('only counts frames while aiming', () => {
    const { auto } = make();
    let t = 0;
    for (let i = 0; i < 1000; i++) auto.frame((t += 1000 / 30), false);
    expect(auto.status).toBe('measuring...');
  });
});

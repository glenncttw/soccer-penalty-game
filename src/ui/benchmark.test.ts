import { describe, expect, it } from 'vitest';
import { readResults, summarize } from './benchmark';

const frames = (gaps: number[], cpuMs = 2) => {
  let time = 0;
  const out = [{ time, cpuMs, calls: 50, triangles: 1000 }];
  for (const gap of gaps) out.push({ time: (time += gap), cpuMs, calls: 50, triangles: 1000 });
  return out;
};

describe('summarize', () => {
  it('works out the frame rate, the 99th percentile and the 1% low', () => {
    // 99 frames of 16 ms and one of 50 ms.
    const r = summarize(1.5, { width: 100, height: 50 }, frames([...Array(99).fill(16), 50]), []);
    expect(r.frames).toBe(100);
    expect(r.frameMs).toBeCloseTo(16.34, 2);
    expect(r.fps).toBeCloseTo(1000 / 16.34, 1);
    expect(r.p99Ms).toBe(50);
    expect(r.low1Fps).toBe(20);
    expect(r.gpuMs).toBeNull();
    expect(r.calls).toBe(50);
  });
});

describe('readResults', () => {
  const at = (ratio: number, gap: number, cpuMs = 2) =>
    summarize(ratio, { width: 1, height: 1 }, frames(Array(60).fill(gap), cpuMs), []);

  it('spots a frame rate held at 30', () => {
    expect(readResults([at(1, 33.3), at(1.5, 33.4)])[0]).toMatch(/30 FPS/);
  });

  it('tells whether fewer pixels help', () => {
    expect(readResults([at(1, 16.7), at(1.5, 25)])[0]).toMatch(/Fewer pixels run faster/);
    expect(readResults([at(1, 20), at(1.5, 20.5)])[0]).toMatch(/hardly changes/);
  });

  it('notices when the code itself is the slow part', () => {
    expect(readResults([at(1, 20, 18)])).toContainEqual(expect.stringMatching(/CPU/));
  });
});

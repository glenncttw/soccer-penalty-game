import { describe, expect, it } from 'vitest';
import { placeCrowd, seeded, type PlacementInput } from './crowdPlacement';
import { findCrowdSpots } from './crowdSpots';

/** Two triangles for a flat rectangle at height y. */
function floor(x0: number, z0: number, x1: number, z1: number, y: number): number[] {
  return [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
}

/** Two triangles for an upright wall from (x0, z0) to (x1, z1), between heights y0 and y1. */
function wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): number[] {
  return [x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0];
}

describe('placeCrowd', () => {
  const y = 0.45;
  // A square ring of step round the middle, a wall at its back and a barrier along its front.
  const steps = new Float32Array([
    ...floor(-3, -3, 3, -2.4, y),
    ...floor(-3, 2.4, 3, 3, y),
    ...floor(-3, -2.4, -2.4, 2.4, y),
    ...floor(2.4, -2.4, 3, 2.4, y),
    ...wall(-3, -3, 3, -3, y, y + 0.4),
    ...wall(3, -3, 3, 3, y, y + 0.4),
    ...wall(3, 3, -3, 3, y, y + 0.4),
    ...wall(-3, 3, -3, -3, y, y + 0.4),
  ]);
  const barrier = new Float32Array([
    ...wall(-2.42, -2.42, 2.42, -2.42, y, y + 0.47),
    ...wall(2.42, -2.42, 2.42, 2.42, y, y + 0.47),
    ...wall(2.42, 2.42, -2.42, 2.42, y, y + 0.47),
    ...wall(-2.42, 2.42, -2.42, -2.42, y, y + 0.47),
  ]);
  const person = [{ x0: -0.2, x1: 0.2, y0: 0, y1: 0.98, z0: -0.15, z1: 0.15 }];
  const shapes = { cheer: person, move: person, calm: person };
  const input: PlacementInput = {
    steps,
    obstacles: [barrier],
    options: {
      rowHeights: [y],
      looks: [
        { shapes, share: 1 },
        { shapes, share: 1 },
      ],
      cheerShare: 0.3,
      spacing: 0.7,
      spacingJitter: 0.25,
      depthJitter: 0.1,
      gaps: 0.1,
      clearance: 0.02,
      sizeVariation: 0.05,
      turn: 0.3,
    },
    seed: 7,
    room: { stadium: new Float32Array([...steps, ...barrier]), shapes: [shapes, shapes] },
    jump: 0.2,
  };

  it('places them as finding the spots with the seeded random numbers does', () => {
    const placement = placeCrowd(input);
    expect(placement.spots.length).toBeGreaterThan(10);
    expect(placement.spots).toEqual(findCrowdSpots(steps, [barrier], { ...input.options, random: seeded(7) }));
    expect(placement.headroom).toHaveLength(placement.spots.length);
  });

  it('says how many random numbers it used, so the crowd carries on with the same ones after it', () => {
    const { draws } = placeCrowd(input);
    expect(draws).toBeGreaterThan(0);
    const all = seeded(7);
    const used = Array.from({ length: draws + 3 }, all);
    const after = seeded(7);
    for (let i = 0; i < draws; i++) after();
    expect([after(), after(), after()]).toEqual(used.slice(draws));
  });

  it('comes back from the background worker as it is', () => {
    // A worker's message is copied the way structuredClone copies it.
    expect(structuredClone(placeCrowd(structuredClone(input)))).toEqual(placeCrowd(input));
  });
});

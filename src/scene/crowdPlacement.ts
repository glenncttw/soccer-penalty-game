import {
  findCrowdSpots,
  rectsOverlap,
  TriangleIndex,
  type CrowdSpot,
  type Moves,
  type PersonBox,
  type SpotOptions,
  type Triangles,
} from './crowdSpots';

/**
 * Placing the crowd: where everyone stands (crowdSpots.ts) and how high each can jump. It's only numbers, no
 * three.js, so the game can run it in the background (crowdWorker.ts) while the landing shows; `Crowd.prepare`
 * measures what it needs.
 */
export interface PlacementInput {
  /** The stand's triangles (floors, risers, stairs), and everything else that could be in the way. */
  steps: Triangles;
  obstacles: Triangles[];
  /** As for findCrowdSpots, but random numbers come from `seed`. */
  options: Omit<SpotOptions, 'random'>;
  seed: number;
  /** What the jumps are measured against (see `Crowd.room`), and the highest jump. */
  room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] };
  jump: number;
}

export interface Placement {
  spots: CrowdSpot[];
  /** How much of a full jump each person has room for (0..1). */
  headroom: number[];
  /** How many numbers of the `seed` sequence the placing used: the crowd carries on from there. */
  draws: number;
}

export function placeCrowd(input: PlacementInput): Placement {
  const next = seeded(input.seed);
  let draws = 0;
  const random = () => {
    draws++;
    return next();
  };
  const spots = findCrowdSpots(input.steps, input.obstacles, { ...input.options, random });
  return { spots, headroom: roomToJump(spots, input.room, input.jump), draws };
}

/** Anything this far above a step's floor is in the way of the people on it (as when they're put there). */
const FLOOR_GAP = 0.02;

/**
 * How much of a jump `highest` metres high each person has room for (0..1): a few have something just above
 * them (a rail, someone in the row behind), so they jump less high.
 */
export function roomToJump(
  spots: CrowdSpot[],
  room: { stadium: Triangles; shapes: Record<Moves, PersonBox[]>[] },
  highest: number,
): number[] {
  if (highest <= 0) return spots.map(() => 1);
  const stadium = new TriangleIndex(room.stadium);
  const placed = spots.map((p) =>
    room.shapes[p.look][p.moves].map((b) => ({
      rect: {
        x: p.x,
        z: p.z,
        angle: p.angle,
        x0: b.x0 * p.size,
        x1: b.x1 * p.size,
        z0: b.z0 * p.size,
        z1: b.z1 * p.size,
      },
      // Their feet stand on the step: only what's above it can get in the way, as when they were put there.
      lo: Math.max(p.y + b.y0 * p.size, p.y + FLOOR_GAP),
      hi: p.y + b.y1 * p.size,
      feet: p.y + b.y0 * p.size,
    })),
  );
  const step = 0.01; // and the room they keep from anyone above
  return spots.map((p, i) => {
    let most = highest;
    // Someone in a row higher up right above part of them (people in the same row jump with them).
    for (const [j, q] of spots.entries()) {
      if (q.y <= p.y || Math.abs(q.x - p.x) > 1.5 || Math.abs(q.z - p.z) > 1.5) continue;
      for (const a of placed[i])
        for (const b of placed[j])
          if (b.feet >= a.hi && rectsOverlap(a.rect, b.rect)) most = Math.min(most, b.feet - a.hi - step);
    }
    // The stadium: all the way up in one go (the space they pass through), else a centimetre at a time.
    const hits = (lift: number) => placed[i].some((b) => stadium.touches(b.rect, b.lo, b.hi + lift));
    if (most > 0 && hits(most)) {
      let free = 0;
      while (!hits(Math.min(free + step, most))) free += step;
      return free / highest;
    }
    return Math.max(0, most) / highest;
  });
}

/** A small seeded random number generator (mulberry32), so the crowd looks the same every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

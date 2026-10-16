/** Mixes whole numbers into one seed, so each (seed, part, part...) gets its own random sequence. */
export function hash(...parts: number[]) {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.floor(p) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** A small seeded random generator (mulberry32): numbers in 0..1. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

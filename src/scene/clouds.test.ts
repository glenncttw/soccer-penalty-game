import { describe, expect, it } from 'vitest';
import { CLOUD_BAND, MAX_CLOUDS, MAX_LOBES, createClouds, packClouds, type Cloud, type Lobe } from './clouds';
import { SKY_SETTINGS } from './skySettings';

const DEG = Math.PI / 180;
const clouds = createClouds(SKY_SETTINGS);
const many = Array.from({ length: 40 }, (_, seed) => createClouds({ ...SKY_SETTINGS, cloudSeed: seed })).flat();

/** Half the width of the part of a lobe above the flat bottom. */
const halfChord = (l: Lobe) => (l.y >= 0 ? l.r : Math.sqrt(Math.max(0, l.r * l.r - l.y * l.y)));

function inside(c: Cloud, x: number, y: number) {
  const bx = Math.min(c.base.right, Math.max(c.base.left, x));
  if (Math.hypot(x - bx, y) < c.base.radius) return true;
  return c.lobes.some((l) => Math.hypot(x - l.x, y - l.y) < l.r);
}

describe('createClouds', () => {
  it('makes the same clouds from the same seed, and different ones from another seed', () => {
    expect(createClouds({ ...SKY_SETTINGS })).toEqual(clouds);
    expect(createClouds({ ...SKY_SETTINGS, cloudSeed: 8 })).not.toEqual(clouds);
  });

  it('makes cloudCount clouds (up to the shader limit), sorted far to near', () => {
    expect(clouds).toHaveLength(SKY_SETTINGS.cloudCount);
    const layers = clouds.map((c) => c.layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
    expect(createClouds({ ...SKY_SETTINGS, cloudCount: 40 })).toHaveLength(MAX_CLOUDS);
    expect(createClouds({ ...SKY_SETTINGS, cloudCount: 0 })).toHaveLength(0);
  });

  it('gives every cloud 4 to 7 lobes, with the biggest, the dome, near the middle and on top', () => {
    const counts = new Set(many.map((c) => c.lobes.length));
    expect([...counts].sort()).toEqual([4, 5, 6, 7]);
    for (const c of many) {
      const dome = c.lobes.reduce((a, b) => (b.r > a.r ? b : a));
      expect(Math.abs(dome.x)).toBeLessThan(0.2);
      expect(dome.y + dome.r).toBeCloseTo(c.height);
      for (const l of c.lobes) if (l !== dome) expect(l.y + l.r).toBeLessThan(c.height);
    }
  });

  it('makes clouds 1 wide, wider than tall, sitting on a flat bottom with no gaps', () => {
    for (const c of many) {
      const lo = Math.min(c.base.left - c.base.radius, ...c.lobes.map((l) => l.x - halfChord(l)));
      const hi = Math.max(c.base.right + c.base.radius, ...c.lobes.map((l) => l.x + halfChord(l)));
      expect(lo).toBeCloseTo(-0.5);
      expect(hi).toBeCloseTo(0.5);
      expect(c.height).toBeGreaterThan(0.2);
      expect(c.height).toBeLessThan(0.5);
      for (let x = -0.45; x <= 0.45; x += 0.01) expect(inside(c, x, 0.01)).toBe(true);
    }
  });

  it('puts each lobe in front of the lobes before it wherever they overlap', () => {
    for (const c of many) {
      c.lobes.forEach((l, i) => {
        for (const o of c.lobes.slice(0, i)) {
          for (let a = 0; a < 2 * Math.PI; a += 0.1) {
            // A point on l's outline: l's surface there is at depth l.z, which must be in front of o's.
            const x = l.x + l.r * Math.cos(a);
            const y = l.y + l.r * Math.sin(a);
            const d2 = (x - o.x) ** 2 + (y - o.y) ** 2;
            if (d2 < o.r * o.r) expect(l.z).toBeGreaterThan(o.z + Math.sqrt(o.r * o.r - d2));
          }
        }
      });
    }
  });

  it('keeps clouds in the same layer apart, even across the end of the band', () => {
    for (const layer of new Set(many.map((c) => c.layer))) {
      for (let seed = 0; seed < 40; seed++) {
        const row = createClouds({ ...SKY_SETTINGS, cloudSeed: seed })
          .filter((c) => c.layer === layer)
          .sort((a, b) => a.azimuth - b.azimuth);
        row.forEach((c, k) => {
          const next = row[(k + 1) % row.length];
          const gap = (next.azimuth - c.azimuth + CLOUD_BAND) % CLOUD_BAND || CLOUD_BAND;
          expect(gap).toBeGreaterThan((c.width + next.width) / 2);
        });
      }
    }
  });

  it('makes far layers smaller, slower and hazier, unless cloudLayerDepth is 0', () => {
    const mean = (cs: Cloud[], f: (c: Cloud) => number) => cs.reduce((s, c) => s + f(c), 0) / cs.length;
    const check = (cs: Cloud[], deep: boolean) => {
      const far = cs.filter((c) => c.layer === 0);
      const near = cs.filter((c) => c.layer === 3);
      const ratio = (f: (c: Cloud) => number) => mean(far, f) / mean(near, f);
      if (deep) {
        expect(ratio((c) => c.width)).toBeLessThan(0.75);
        expect(ratio((c) => c.speed)).toBeLessThan(0.7);
        expect(mean(far, (c) => c.haze)).toBeGreaterThan(0.15);
        expect(mean(far, (c) => c.elevation)).toBeLessThan(mean(near, (c) => c.elevation) + 0.5 * DEG);
      } else {
        expect(ratio((c) => c.width)).toBeCloseTo(1, 0);
        expect(ratio((c) => c.speed)).toBeCloseTo(1);
        expect(mean(far, (c) => c.haze)).toBe(0);
      }
    };
    check(many, true);
    check(Array.from({ length: 40 }, (_, seed) => createClouds({ ...SKY_SETTINGS, cloudSeed: seed, cloudLayerDepth: 0 })).flat(), false);
  });

  it('starts with 3 to 7 clouds in a desktop view of the goal', () => {
    const halfView = 27.5 * DEG; // a 16:9 screen
    const lowEnough = 15 * DEG; // the top of the screen
    for (let seed = 0; seed < 40; seed++) {
      const seen = createClouds({ ...SKY_SETTINGS, cloudSeed: seed }).filter(
        (c) => Math.abs(c.azimuth) < halfView && c.elevation < lowEnough,
      );
      expect(seen.length).toBeGreaterThanOrEqual(3);
      expect(seen.length).toBeLessThanOrEqual(7);
    }
  });
});

describe('packClouds', () => {
  it('packs the clouds into the fixed-size arrays the shader reads, with zeros after the last lobe', () => {
    const packed = packClouds(clouds);
    expect(packed.count).toBe(clouds.length);
    expect(packed.place).toHaveLength(MAX_CLOUDS * 4);
    expect(packed.lobes).toHaveLength(MAX_CLOUDS * MAX_LOBES * 4);
    const c = clouds[2];
    expect(Array.from(packed.place.slice(8, 12))).toEqual([c.azimuth, c.elevation, c.width, c.speed].map(Math.fround));
    expect(Array.from(packed.base.slice(8, 11))).toEqual([c.base.left, c.base.right, c.base.radius].map(Math.fround));
    const first = (2 * MAX_LOBES) * 4;
    expect(packed.lobes[first + 3]).toBeCloseTo(c.lobes[0].r);
    if (c.lobes.length < MAX_LOBES) expect(packed.lobes[first + c.lobes.length * 4 + 3]).toBe(0);
  });
});

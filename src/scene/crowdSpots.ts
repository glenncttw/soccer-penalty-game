/**
 * Finds where the crowd can stand, from the stadium's own geometry: one row on each chosen stand
 * step, as close to the front of the step (right behind its barrier) as a person fits, facing the
 * pitch, and never on the stairs or inside a barrier, wall or step edge.
 *
 * A person is a few boxes (body, arms, head...), each from its own height to its own height, so a
 * head may reach over a barrier lower than it, but not into a rail at head height. For each row, a
 * top-down grid of small cells over the step finds where the body has room to stand at all; going
 * round the stand, the cell nearest the pitch in each direction gives the row's line. Along it, a
 * person is put where none of their boxes, turned to face the pitch, touches anything of the
 * stadium at the box's heights or the stairs (see findStairs), and the boxes they stand on are on
 * the floor, a bit further back on the step if needed, keeping `spacing` between neighbours.
 */

/** Triangles as a flat list of world positions: x, y, z of 3 corners each. */
export type Triangles = Float32Array;

export interface CrowdSpot {
  x: number;
  y: number;
  z: number;
  /** Turn about the up axis, in radians: the person's front (+z) points to (sin, cos) of it. */
  angle: number;
  /** Size of this person: 1 = as made. */
  size: number;
  /** How much this person moves: as much as there's room for here. */
  moves: Moves;
  /** Which row (0 = the lowest step in the list). */
  row: number;
}

/** How much a person moves: cheering (arms going up now and then), moving about, or calm (only bouncing a little). */
export type Moves = 'cheer' | 'move' | 'calm';

/** A box of a person's shape, in their own space: feet at y = 0, facing +z. Metres. */
export interface PersonBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface SpotOptions {
  /** Heights of the steps to fill, one row each. */
  rowHeights: number[];
  /** The room the person takes up at the size it was made, for each way of moving. */
  shapes: Record<Moves, PersonBox[]>;
  /** 0..1: share of people who cheer, where there's room for it. */
  cheerShare: number;
  /** Centre-to-centre distance along a row, on average. */
  spacing: number;
  /** 0..1: how much the distance to the next person differs from `spacing`, either way. */
  spacingJitter: number;
  /** How far back from the front of the step a person may like to stand, at most (if there's room). */
  depthJitter: number;
  /** 0..1: share of spots left empty. */
  gaps: number;
  /** Space kept free around each person. */
  clearance: number;
  /** 0..1: how much bigger or smaller than made a person may be. */
  sizeVariation: number;
  /** Most a person is turned away from facing straight ahead, either way, in radians. */
  turn: number;
  /** Random numbers from 0 to 1, for spacing, depth, gaps, sizes and turns. */
  random: () => number;
}

const CELL = 0.05; // grid cell size, metres
const LEVEL = 0.03; // a step triangle is within this of the row's height
const ABOVE = 0.02; // anything from this far above the step's floor counts as in the way
const STAIR_LEVEL = 0.05; // a flat level with less than this share of the biggest floor's area is a stair's step
const STAIR_REACH = 0.5; // stair steps count when they are at most this far above or below a row
const STAIR_GAP = 1; // stair steps closer than this belong to the same stairs
const STEP_BACK = 0.5; // how far back from the front of the step a person may stand
const NUDGE = 0.02; // steps in which a person is moved back to find room
const SKIP = 0.1; // after a spot where nobody fits, the next try is this far along the row
const ON_FLOOR = 0.05; // a box starting this low stands on the floor
const CHEER_ROOM = 1.25; // how much more room along the row a cheering person wants

/** Spots for every row, from the stand (`steps`: floors, risers and stairs) and everything else that is in the way. */
export function findCrowdSpots(steps: Triangles, obstacles: Triangles[], o: SpotOptions): CrowdSpot[] {
  const spots: CrowdSpot[] = [];
  const stairs = new TriangleIndex(findStairs(steps, o.rowHeights));
  const all = [...o.shapes.cheer, ...o.shapes.move, ...o.shapes.calm];
  const feet = o.shapes.calm.filter((b) => b.y0 < ON_FLOOR);
  if (feet.length === 0) throw new Error('The crowd person has no part standing on the floor');
  const biggest = 1 + o.sizeVariation;
  const smallest = 1 - o.sizeVariation;
  const top = Math.max(...all.map((b) => b.y1)) * biggest;
  const feetTop = Math.max(...feet.map((b) => b.y1)) * smallest;
  // Everyone placed so far, as their boxes, and how far apart two people's middles can be and still touch.
  const placed: {
    x: number;
    z: number;
    boxes: { rect: Rect; lo: number; hi: number }[];
  }[] = [];
  const reach =
    2 *
      biggest *
      Math.max(
        ...all.map((b) =>
          Math.max(Math.hypot(b.x0, b.z0), Math.hypot(b.x1, b.z0), Math.hypot(b.x0, b.z1), Math.hypot(b.x1, b.z1)),
        ),
      ) +
    2 * o.clearance;
  o.rowHeights.forEach((y, row) => {
    const floor = trianglesWhere(steps, (t, i) => isFloorAt(t, y, i));
    if (floor.length === 0) throw new Error(`No stand step found at ${y} m for the crowd`);
    const box = bounds(floor, 0.5);
    const onFloor = new Grid(box);
    for (let i = 0; i < floor.length; i += 9) onFloor.fill(floor, i, 1);
    // Only what is within a person's heights on this step can be in the way.
    const near = new TriangleIndex(
      concat(
        [steps, ...obstacles].map((list) =>
          trianglesWhere(
            list,
            (t, i) =>
              Math.max(t[i + 1], t[i + 4], t[i + 7]) > y + ABOVE && Math.min(t[i + 1], t[i + 4], t[i + 7]) < y + top,
          ),
        ),
      ),
    );

    // The line runs where the smallest body has room to stand at all.
    const body = new Grid(box);
    body.cells.set(onFloor.cells);
    const t = near.triangles;
    for (let i = 0; i < t.length; i += 9) {
      if (Math.min(t[i + 1], t[i + 4], t[i + 7]) < y + feetTop) body.block(t, i);
    }
    for (let i = 0; i < stairs.triangles.length; i += 9) body.block(stairs.triangles, i);
    const depth = Math.min(...feet.map((b) => Math.min(-b.z0, b.z1))) * smallest + o.clearance;
    const line = rowLine(body, body.roomAround(), depth);

    const fits = (x: number, z: number, angle: number, size: number, shape: PersonBox[]) => {
      const boxes = shape.map((b) => ({
        b,
        rect: {
          x,
          z,
          angle,
          x0: b.x0 * size - o.clearance,
          x1: b.x1 * size + o.clearance,
          z0: b.z0 * size - o.clearance,
          z1: b.z1 * size + o.clearance,
        },
        lo: y + b.y0 * size,
        hi: y + b.y1 * size,
      }));
      const ok = boxes.every(({ b, rect, lo, hi }) => {
        if (b.y0 < ON_FLOOR && !onFloor.covers(rect)) return false;
        return !near.touches(rect, Math.max(lo, y + ABOVE), hi) && !stairs.touches(rect, -Infinity, Infinity);
      });
      // Nobody may touch anyone already placed, in this row or the one in front.
      const others = placed.filter((q) => Math.hypot(q.x - x, q.z - z) < reach);
      if (
        !ok ||
        others.some((q) =>
          q.boxes.some((a) => boxes.some((c) => a.lo < c.hi && c.lo < a.hi && rectsOverlap(a.rect, c.rect))),
        )
      )
        return undefined;
      return boxes;
    };
    const centre = { x: (box.x0 + box.x1) / 2, z: (box.z0 + box.z1) / 2 };
    // People (and spots left empty on purpose), each with the room they want along the row.
    const taken: { x: number; z: number; room: number }[] = [];
    const crowded = (x: number, z: number, room: number) =>
      taken.some((q) => Math.hypot(x - q.x, z - q.z) < (room + q.room) / 2);
    const kept: CrowdSpot[] = [];
    let failed: { x: number; z: number } | undefined;
    line.forEach((p, i) => {
      // Cheering people swing their arms out to the sides, so they want a bit more room.
      const cheers = o.random() < o.cheerShare;
      const room = o.spacing * (1 + o.spacingJitter * (o.random() * 2 - 1)) * (cheers ? CHEER_ROOM : 1);
      if (crowded(p.x, p.z, room)) return;
      if (failed && Math.hypot(p.x - failed.x, p.z - failed.z) < SKIP) return;
      failed = p;
      if (o.random() < o.gaps) {
        taken.push({ x: p.x, z: p.z, room });
        failed = undefined;
        return;
      }
      const front = facing(line, i, centre);
      const straight = Math.atan2(front.x, front.z);
      const size = 1 + o.sizeVariation * (o.random() * 2 - 1);
      const angle = straight + o.turn * (o.random() * 2 - 1);
      // Where it's tight, a person moves less, stands straight, or is a bit smaller, before going elsewhere on the step.
      const tries: { angle: number; size: number; moves: Moves }[] = [
        ...(cheers
          ? [
              { angle, size, moves: 'cheer' as const },
              { angle: straight, size, moves: 'cheer' as const },
            ]
          : []),
        { angle, size, moves: 'move' },
        { angle: straight, size, moves: 'move' },
        { angle, size, moves: 'calm' },
        { angle: straight, size, moves: 'calm' },
        { angle: straight, size: smallest, moves: 'calm' },
      ];
      // Each person likes to stand a bit further back or not; the nearest spot to that with room wins. The line is
      // only as exact as its cells, so the frontmost try is half a cell further forward.
      const like = -CELL / 2 + o.depthJitter * o.random();
      const backs: number[] = [];
      for (let back = -CELL / 2; back <= STEP_BACK + 1e-9; back += NUDGE) backs.push(back);
      backs.sort((a, b) => Math.abs(a - like) - Math.abs(b - like));
      // A person would rather stand somewhere else on the step than move less.
      for (const f of tries) {
        for (const back of backs) {
          const x = p.x - front.x * back;
          const z = p.z - front.z * back;
          if (crowded(x, z, room)) continue;
          const boxes = fits(x, z, f.angle, f.size, o.shapes[f.moves]);
          if (!boxes) continue;
          kept.push({
            x,
            y,
            z,
            angle: f.angle,
            size: f.size,
            moves: f.moves,
            row,
          });
          taken.push({ x, z, room });
          placed.push({ x, z, boxes });
          failed = undefined;
          return;
        }
      }
    });
    spots.push(...kept);
  });
  return spots;
}

function concat(lists: Triangles[]): Triangles {
  const out = new Float32Array(lists.reduce((n, l) => n + l.length, 0));
  let k = 0;
  for (const l of lists) {
    out.set(l, k);
    k += l.length;
  }
  return out;
}

/** A box seen from above: its own x and z ranges, turned by `angle` about its centre (x, z). */
interface Rect {
  x: number;
  z: number;
  angle: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Triangles sorted into a top-down grid of buckets, to find the ones near a spot quickly. */
class TriangleIndex {
  private static readonly SIZE = 0.5; // bucket size, metres
  private readonly buckets = new Map<number, number[]>();

  constructor(readonly triangles: Triangles) {
    for (let i = 0; i < triangles.length; i += 9) {
      const [i0, i1, j0, j1] = this.span(
        Math.min(triangles[i], triangles[i + 3], triangles[i + 6]),
        Math.max(triangles[i], triangles[i + 3], triangles[i + 6]),
        Math.min(triangles[i + 2], triangles[i + 5], triangles[i + 8]),
        Math.max(triangles[i + 2], triangles[i + 5], triangles[i + 8]),
      );
      for (let j = j0; j <= j1; j++) {
        for (let k = i0; k <= i1; k++) {
          const key = j * 100003 + k;
          const list = this.buckets.get(key) ?? [];
          list.push(i);
          this.buckets.set(key, list);
        }
      }
    }
  }

  private span(x0: number, x1: number, z0: number, z1: number): [number, number, number, number] {
    const s = TriangleIndex.SIZE;
    return [Math.floor(x0 / s), Math.floor(x1 / s), Math.floor(z0 / s), Math.floor(z1 / s)];
  }

  /** Whether any triangle reaching into the heights lo..hi overlaps the box seen from above. */
  touches(r: Rect, lo: number, hi: number): boolean {
    const reach = Math.max(
      Math.hypot(r.x0, r.z0),
      Math.hypot(r.x1, r.z0),
      Math.hypot(r.x0, r.z1),
      Math.hypot(r.x1, r.z1),
    );
    const [i0, i1, j0, j1] = this.span(r.x - reach, r.x + reach, r.z - reach, r.z + reach);
    const seen = new Set<number>();
    const t = this.triangles;
    for (let j = j0; j <= j1; j++) {
      for (let k = i0; k <= i1; k++) {
        for (const i of this.buckets.get(j * 100003 + k) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          if (Math.max(t[i + 1], t[i + 4], t[i + 7]) <= lo || Math.min(t[i + 1], t[i + 4], t[i + 7]) >= hi) continue;
          if (overlaps(r, t, i)) return true;
        }
      }
    }
    return false;
  }
}

/** The corners of a turned box seen from above, in the world. */
function corners(r: Rect): number[][] {
  const cos = Math.cos(r.angle);
  const sin = Math.sin(r.angle);
  return [
    [r.x0, r.z0],
    [r.x1, r.z0],
    [r.x1, r.z1],
    [r.x0, r.z1],
  ].map(([lx, lz]) => [r.x + lx * cos + lz * sin, r.z - lx * sin + lz * cos]);
}

/** Whether two turned boxes seen from above overlap (separating axis test). */
function rectsOverlap(a: Rect, b: Rect): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const angle of [a.angle, b.angle]) {
    // A box's own sides run along its x and z, turned by its angle.
    for (const [ax, az] of [
      [Math.cos(angle), -Math.sin(angle)],
      [Math.sin(angle), Math.cos(angle)],
    ]) {
      const pa = ca.map((c) => c[0] * ax + c[1] * az);
      const pb = cb.map((c) => c[0] * ax + c[1] * az);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Whether a triangle seen from above overlaps a turned box (separating axis test). */
function overlaps(r: Rect, t: Triangles, i: number): boolean {
  const cos = Math.cos(r.angle);
  const sin = Math.sin(r.angle);
  // The triangle's corners in the box's own space.
  const p: number[][] = [];
  for (let k = 0; k < 9; k += 3) {
    const dx = t[i + k] - r.x;
    const dz = t[i + k + 2] - r.z;
    p.push([dx * cos - dz * sin, dx * sin + dz * cos]);
  }
  if (Math.max(p[0][0], p[1][0], p[2][0]) < r.x0 || Math.min(p[0][0], p[1][0], p[2][0]) > r.x1) return false;
  if (Math.max(p[0][1], p[1][1], p[2][1]) < r.z0 || Math.min(p[0][1], p[1][1], p[2][1]) > r.z1) return false;
  const corners = [
    [r.x0, r.z0],
    [r.x1, r.z0],
    [r.x1, r.z1],
    [r.x0, r.z1],
  ];
  for (let e = 0; e < 3; e++) {
    const a = p[e];
    const b = p[(e + 1) % 3];
    const nx = -(b[1] - a[1]);
    const nz = b[0] - a[0];
    if (Math.hypot(nx, nz) < 1e-9) continue;
    const tri = p.map((q) => q[0] * nx + q[1] * nz);
    const box = corners.map((q) => q[0] * nx + q[1] * nz);
    if (Math.max(...tri) < Math.min(...box) || Math.min(...tri) > Math.max(...box)) return false;
  }
  return true;
}

/** Which way a person on the row line faces: across the line, toward the pitch (the middle of the step's outline). */
function facing(
  line: { x: number; z: number }[],
  i: number,
  centre: { x: number; z: number },
): { x: number; z: number } {
  // The line's direction here, from its points a few cells either side (not across a gap, like the stairs).
  const reach = 4;
  let a = line[i];
  let b = line[i];
  for (let k = 1; k <= reach; k++) {
    const p = line[(i - k + line.length) % line.length];
    if (Math.hypot(p.x - a.x, p.z - a.z) > 3 * CELL) break;
    a = p;
  }
  for (let k = 1; k <= reach; k++) {
    const p = line[(i + k) % line.length];
    if (Math.hypot(p.x - b.x, p.z - b.z) > 3 * CELL) break;
    b = p;
  }
  let nx = -(b.z - a.z);
  let nz = b.x - a.x;
  const len = Math.hypot(nx, nz);
  const toCentre = { x: centre.x - line[i].x, z: centre.z - line[i].z };
  if (len < 1e-6) {
    // A lone point: face the middle.
    const d = Math.hypot(toCentre.x, toCentre.z) || 1;
    return { x: toCentre.x / d, z: toCentre.z / d };
  }
  nx /= len;
  nz /= len;
  return nx * toCentre.x + nz * toCentre.z >= 0 ? { x: nx, z: nz } : { x: -nx, z: -nz };
}

/**
 * A person's shape from the triangles of one of their parts: a box for each `slice`-high layer of
 * it, so a part that is wide at one height and narrow at another (like hair) doesn't take up its
 * widest room all the way down.
 */
export function shapeOf(part: Triangles, slice: number): PersonBox[] {
  let bottom = Infinity;
  let top = -Infinity;
  for (let i = 1; i < part.length; i += 3) {
    bottom = Math.min(bottom, part[i]);
    top = Math.max(top, part[i]);
  }
  const boxes: PersonBox[] = [];
  for (let y0 = bottom; y0 < top - 1e-6; y0 += slice) {
    const y1 = Math.min(y0 + slice, top);
    const b = {
      x0: Infinity,
      x1: -Infinity,
      y0,
      y1,
      z0: Infinity,
      z1: -Infinity,
    };
    const add = (x: number, z: number) => {
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.z0 = Math.min(b.z0, z);
      b.z1 = Math.max(b.z1, z);
    };
    // The part of each triangle within this layer: its corners inside it, and where its edges cross the layer's top and bottom.
    for (let i = 0; i < part.length; i += 9) {
      for (let e = 0; e < 3; e++) {
        const a = i + 3 * e;
        const c = i + 3 * ((e + 1) % 3);
        const ay = part[a + 1];
        const cy = part[c + 1];
        if (ay >= y0 && ay <= y1) add(part[a], part[a + 2]);
        for (const h of [y0, y1]) {
          if ((ay - h) * (cy - h) < 0) {
            const f = (h - ay) / (cy - ay);
            add(part[a] + (part[c] - part[a]) * f, part[a + 2] + (part[c + 2] - part[a + 2]) * f);
          }
        }
      }
    }
    if (b.x0 <= b.x1) boxes.push(b);
  }
  return boxes;
}

/**
 * The whole width and length of every stairs, seen from above, as triangles. Stairs go up in half
 * steps, so every other step of theirs is level with a row's floor and looks just like it; the
 * small steps in between give them away. The outline round each stairs' small steps covers its
 * steps at floor level too.
 */
function findStairs(steps: Triangles, rowHeights: number[]): Triangles {
  // Flat triangles, grouped into levels by height.
  const flat: { t: number[]; y: number; area: number }[] = [];
  for (let i = 0; i < steps.length; i += 9) {
    const t = Array.from(steps.subarray(i, i + 9));
    const y = (t[1] + t[4] + t[7]) / 3;
    if (isFloorAt(t, y))
      flat.push({
        t,
        y,
        area: Math.abs((t[3] - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (t[5] - t[2])) / 2,
      });
  }
  flat.sort((a, b) => a.y - b.y);
  const levels: (typeof flat)[] = [];
  for (const f of flat) {
    const level = levels[levels.length - 1];
    if (level && f.y - level[level.length - 1].y <= LEVEL) level.push(f);
    else levels.push([f]);
  }
  const areaOf = (level: typeof flat) => level.reduce((sum, f) => sum + f.area, 0);
  const biggest = Math.max(0, ...levels.map(areaOf));
  const lowest = Math.min(...rowHeights) - STAIR_REACH;
  const highest = Math.max(...rowHeights) + STAIR_REACH;
  const corners: number[][] = [];
  for (const level of levels) {
    const y = level[0].y;
    if (y < lowest || y > highest || areaOf(level) >= STAIR_LEVEL * biggest) continue;
    for (const f of level) for (let k = 0; k < 9; k += 3) corners.push([f.t[k], f.t[k + 2]]);
  }

  // Corners near each other belong to the same stairs.
  const group = corners.map((_, k) => k);
  const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k])));
  for (let a = 0; a < corners.length; a++) {
    for (let b = a + 1; b < corners.length; b++) {
      if (Math.hypot(corners[a][0] - corners[b][0], corners[a][1] - corners[b][1]) < STAIR_GAP)
        group[root(a)] = root(b);
    }
  }
  const groups = new Map<number, number[][]>();
  corners.forEach((c, k) => {
    const g = groups.get(root(k)) ?? [];
    g.push(c);
    groups.set(root(k), g);
  });

  const out: number[] = [];
  for (const g of groups.values()) {
    const hull = outline(g);
    for (let k = 1; k + 1 < hull.length; k++) {
      for (const [x, z] of [hull[0], hull[k], hull[k + 1]]) out.push(x, 0, z);
    }
  }
  return new Float32Array(out);
}

/** The outline round points seen from above (their convex hull), in order. */
function outline(points: number[][]): number[][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: number[][]) => {
    const h: number[][] = [];
    for (const q of list) {
      while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half(p.reverse())];
}

/** A triangle that lies flat at height y (a step's floor). */
function isFloorAt(t: ArrayLike<number>, y: number, i = 0): boolean {
  if (Math.max(Math.abs(t[i + 1] - y), Math.abs(t[i + 4] - y), Math.abs(t[i + 7] - y)) > LEVEL) return false;
  const area = Math.abs((t[i + 3] - t[i]) * (t[i + 8] - t[i + 2]) - (t[i + 6] - t[i]) * (t[i + 5] - t[i + 2]));
  return area > 1e-6;
}

/** The triangles of a list (the one starting at index i) that `keep` says yes to. */
function trianglesWhere(list: Triangles, keep: (list: Triangles, i: number) => boolean): Triangles {
  const picked: number[] = [];
  for (let i = 0; i < list.length; i += 9) if (keep(list, i)) picked.push(i);
  const out = new Float32Array(picked.length * 9);
  picked.forEach((i, k) => out.set(list.subarray(i, i + 9), k * 9));
  return out;
}

interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function bounds(list: Triangles, margin: number): Box {
  const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (let i = 0; i < list.length; i += 3) {
    b.x0 = Math.min(b.x0, list[i]);
    b.x1 = Math.max(b.x1, list[i]);
    b.z0 = Math.min(b.z0, list[i + 2]);
    b.z1 = Math.max(b.z1, list[i + 2]);
  }
  return {
    x0: b.x0 - margin,
    z0: b.z0 - margin,
    x1: b.x1 + margin,
    z1: b.z1 + margin,
  };
}

/** Top-down cells over one step: 1 = free floor, 0 = not floor or blocked. */
class Grid {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint8Array;

  constructor(readonly box: Box) {
    this.w = Math.ceil((box.x1 - box.x0) / CELL);
    this.h = Math.ceil((box.z1 - box.z0) / CELL);
    this.cells = new Uint8Array(this.w * this.h);
  }

  /** The world position of a cell's middle. */
  x(i: number) {
    return this.box.x0 + (i + 0.5) * CELL;
  }
  z(j: number) {
    return this.box.z0 + (j + 0.5) * CELL;
  }

  /** Sets every cell whose middle is inside the triangle (seen from above). */
  fill(list: Triangles, k: number, value: number) {
    const ax = list[k],
      az = list[k + 2],
      bx = list[k + 3],
      bz = list[k + 5],
      cx = list[k + 6],
      cz = list[k + 8];
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-9) return;
    const s = Math.sign(area);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - this.box.x0) / CELL));
    const i1 = Math.min(this.w - 1, Math.floor((Math.max(ax, bx, cx) - this.box.x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - this.box.z0) / CELL));
    const j1 = Math.min(this.h - 1, Math.floor((Math.max(az, bz, cz) - this.box.z0) / CELL));
    const eps = -1e-6;
    for (let j = j0; j <= j1; j++) {
      const pz = this.z(j);
      for (let i = i0; i <= i1; i++) {
        const px = this.x(i);
        const e0 = s * ((bx - ax) * (pz - az) - (px - ax) * (bz - az));
        const e1 = s * ((cx - bx) * (pz - bz) - (px - bx) * (cz - bz));
        const e2 = s * ((ax - cx) * (pz - cz) - (px - cx) * (az - cz));
        if (e0 >= eps && e1 >= eps && e2 >= eps) this.cells[j * this.w + i] = value;
      }
    }
  }

  /** Blocks every cell the triangle covers or touches seen from above, upright walls and thin bars included. */
  block(list: Triangles, k: number) {
    this.fill(list, k, 0);
    for (let e = 0; e < 3; e++) {
      const a = k + 3 * e;
      const b = k + 3 * ((e + 1) % 3);
      const ax = list[a],
        az = list[a + 2],
        bx = list[b],
        bz = list[b + 2];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (0.5 * CELL)));
      for (let s = 0; s <= steps; s++) {
        const i = Math.floor((ax + ((bx - ax) * s) / steps - this.box.x0) / CELL);
        const j = Math.floor((az + ((bz - az) * s) / steps - this.box.z0) / CELL);
        if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.cells[j * this.w + i] = 0;
      }
    }
  }

  /** Whether the box seen from above lies on set cells (shrunk by a cell, as cells only roughly follow edges). */
  covers(r: Rect): boolean {
    const cos = Math.cos(r.angle);
    const sin = Math.sin(r.angle);
    const x0 = r.x0 + CELL,
      x1 = r.x1 - CELL,
      z0 = r.z0 + CELL,
      z1 = r.z1 - CELL;
    const nx = Math.max(1, Math.ceil((x1 - x0) / CELL));
    const nz = Math.max(1, Math.ceil((z1 - z0) / CELL));
    for (let a = 0; a <= nx; a++) {
      const lx = x0 + ((x1 - x0) * a) / nx;
      for (let c = 0; c <= nz; c++) {
        const lz = z0 + ((z1 - z0) * c) / nz;
        const i = Math.floor((r.x + lx * cos + lz * sin - this.box.x0) / CELL);
        const j = Math.floor((r.z - lx * sin + lz * cos - this.box.z0) / CELL);
        if (i < 0 || j < 0 || i >= this.w || j >= this.h || !this.cells[j * this.w + i]) return false;
      }
    }
    return true;
  }

  /** For each free cell, how far (metres) it is to the nearest cell that isn't free. */
  roomAround(): Float32Array {
    const { w, h } = this;
    const d = new Float32Array(w * h);
    const far = 1e6;
    for (let k = 0; k < d.length; k++) d[k] = this.cells[k] ? far : 0;
    const diag = Math.SQRT2;
    const relax = (k: number, other: number, cost: number) => {
      if (d[other] + cost < d[k]) d[k] = d[other] + cost;
    };
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (!d[k]) continue;
        if (i === 0 || j === 0 || i === w - 1 || j === h - 1) d[k] = Math.min(d[k], 1);
        if (i > 0) relax(k, k - 1, 1);
        if (j > 0) relax(k, k - w, 1);
        if (i > 0 && j > 0) relax(k, k - w - 1, diag);
        if (i < w - 1 && j > 0) relax(k, k - w + 1, diag);
      }
    }
    for (let j = h - 1; j >= 0; j--) {
      for (let i = w - 1; i >= 0; i--) {
        const k = j * w + i;
        if (!d[k]) continue;
        if (i < w - 1) relax(k, k + 1, 1);
        if (j < h - 1) relax(k, k + w, 1);
        if (i < w - 1 && j < h - 1) relax(k, k + w + 1, diag);
        if (i > 0 && j < h - 1) relax(k, k + w - 1, diag);
      }
    }
    // Distances are between cell middles; the edge of the blocked cell is half a cell nearer.
    for (let k = 0; k < d.length; k++) d[k] = Math.max(0, (d[k] - 0.5) * CELL);
    return d;
  }
}

/**
 * The row's line: going round the stand from the middle of the step's outline, the spot nearest
 * the pitch in each direction that has `need` metres of room around it, in order round the stand.
 * Where nothing fits (the stairs), the line simply has a gap.
 */
function rowLine(grid: Grid, room: Float32Array, need: number): { x: number; z: number }[] {
  const cx = (grid.box.x0 + grid.box.x1) / 2;
  const cz = (grid.box.z0 + grid.box.z1) / 2;
  const cells: { x: number; z: number; r: number; a: number }[] = [];
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (room[j * grid.w + i] < need) continue;
      const x = grid.x(i);
      const z = grid.z(j);
      cells.push({
        x,
        z,
        r: Math.hypot(x - cx, z - cz),
        a: Math.atan2(z - cz, x - cx) + Math.PI,
      });
    }
  }
  if (cells.length === 0) return [];
  // Directions one cell wide where the step is nearest the middle, so every direction holds some cells.
  const nearest = Math.min(...cells.map((c) => c.r));
  const bins = Math.max(64, Math.floor((2 * Math.PI * nearest) / CELL));
  const best = new Array<{ x: number; z: number; r: number } | undefined>(bins);
  for (const c of cells) {
    const b = Math.floor((c.a / (2 * Math.PI)) * bins) % bins;
    if (!best[b] || c.r < best[b]!.r) best[b] = c;
  }
  return best.filter((p): p is { x: number; z: number; r: number } => !!p).map(({ x, z }) => ({ x, z }));
}

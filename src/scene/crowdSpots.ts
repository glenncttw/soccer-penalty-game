/**
 * Finds where the crowd can stand, from the stadium's own geometry: one row on each chosen stand
 * step, as close to the front of the step (right behind its barrier) as a person fits, and never
 * on the stairs or inside a barrier, wall or step edge.
 *
 * Works on a top-down grid of small cells. For each row: the cells of its step are marked, then
 * everything of the stadium a person standing there would bump into is blocked, and only cells
 * with room for a whole person around them are kept. Going round the stand, the cell nearest the
 * pitch in each direction gives the row's line, and spots are laid along it.
 */

/** Triangles as a flat list of world positions: x, y, z of 3 corners each. */
export type Triangles = Float32Array;

export interface CrowdSpot {
  x: number;
  y: number;
  z: number;
  /** Which row (0 = the lowest step in the list). */
  row: number;
}

export interface SpotOptions {
  /** Heights of the steps to fill, one row each. */
  rowHeights: number[];
  /** Person radius and height (the tallest one), in metres. */
  radius: number;
  height: number;
  /** Centre-to-centre distance along a row. */
  spacing: number;
  /** Space kept free around each person. */
  clearance: number;
}

const CELL = 0.05; // grid cell size, metres
const LEVEL = 0.03; // a step triangle is within this of the row's height
const ABOVE = 0.02; // anything from this far above the step's floor counts as in the way

/** Spots for every row, from the stand (`steps`: floors, risers and stairs) and everything else that is in the way. */
export function findCrowdSpots(steps: Triangles, obstacles: Triangles[], o: SpotOptions): CrowdSpot[] {
  const spots: CrowdSpot[] = [];
  o.rowHeights.forEach((y, row) => {
    const floor = trianglesWhere(steps, (t) => isFloorAt(t, y));
    if (floor.length === 0) throw new Error(`No stand step found at ${y} m for the crowd`);
    const grid = new Grid(bounds(floor, 0.5));
    for (let i = 0; i < floor.length; i += 9) grid.fill(floor, i, 1);
    const top = y + o.height;
    for (const list of [steps, ...obstacles]) {
      for (let i = 0; i < list.length; i += 9) {
        const lo = Math.min(list[i + 1], list[i + 4], list[i + 7]);
        const hi = Math.max(list[i + 1], list[i + 4], list[i + 7]);
        if (hi > y + ABOVE && lo < top) grid.block(list, i);
      }
    }
    const room = grid.roomAround();
    for (const p of rowLine(grid, room, o.radius + o.clearance)) spots.push({ ...p, y, row });
  });
  return thinOut(spots, o.spacing);
}

/** A triangle that lies flat at height y (a step's floor). */
function isFloorAt(t: number[], y: number): boolean {
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
  if (Math.max(Math.abs(ay - y), Math.abs(by - y), Math.abs(cy - y)) > LEVEL) return false;
  const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az));
  return area > 1e-6;
}

function trianglesWhere(list: Triangles, keep: (t: number[]) => boolean): Triangles {
  const out: number[] = [];
  for (let i = 0; i < list.length; i += 9) {
    const t = Array.from(list.subarray(i, i + 9));
    if (keep(t)) out.push(...t);
  }
  return new Float32Array(out);
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
  return { x0: b.x0 - margin, z0: b.z0 - margin, x1: b.x1 + margin, z1: b.z1 + margin };
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
    const ax = list[k], az = list[k + 2], bx = list[k + 3], bz = list[k + 5], cx = list[k + 6], cz = list[k + 8];
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
      const ax = list[a], az = list[a + 2], bx = list[b], bz = list[b + 2];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (0.5 * CELL)));
      for (let s = 0; s <= steps; s++) {
        const i = Math.floor((ax + ((bx - ax) * s) / steps - this.box.x0) / CELL);
        const j = Math.floor((az + ((bz - az) * s) / steps - this.box.z0) / CELL);
        if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.cells[j * this.w + i] = 0;
      }
    }
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
      cells.push({ x, z, r: Math.hypot(x - cx, z - cz), a: Math.atan2(z - cz, x - cx) + Math.PI });
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

/** Keeps spots at least `spacing` apart in each row, so the tubes never touch. */
function thinOut(spots: CrowdSpot[], spacing: number): CrowdSpot[] {
  const out: CrowdSpot[] = [];
  for (const p of spots) {
    // Walking along the row line, the next spot is the first one far enough from every spot so far
    // in its row; that also keeps the row's end apart from its start where the line goes all the way round.
    const crowded = out.some((q) => q.row === p.row && Math.hypot(p.x - q.x, p.z - q.z) < spacing);
    if (!crowded) out.push(p);
  }
  return out;
}

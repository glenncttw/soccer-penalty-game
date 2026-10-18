import type { Vec3 } from '../physics/ballForces';
import type { ColliderMesh } from '../worldConfig';

type Point = [x: number, z: number];

/**
 * The ring of ad boards seen from above. The boards are solid, so a ball outside the ring
 * can only have flown over them, into the stands.
 */
export class BoardsBoundary {
  /** The boards' outline from above, counter-clockwise (x, z). */
  private readonly hull: Point[];
  /** The front ends of the side boards: the ring is open toward the player. */
  private readonly frontZ: number;

  constructor(boards: ColliderMesh[]) {
    const points: Point[] = [];
    for (const b of boards) for (let i = 0; i < b.vertices.length; i += 3) points.push([b.vertices[i], b.vertices[i + 2]]);
    this.hull = convexHull(points);
    this.frontZ = Math.max(...points.map(([, z]) => z));
  }

  /** True once the ball's centre is past the boards, into the stands. */
  isBeyond(p: Vec3): boolean {
    if (this.hull.length < 3 || p.z >= this.frontZ) return false;
    for (let i = 0; i < this.hull.length; i++) {
      const [ax, az] = this.hull[i];
      const [bx, bz] = this.hull[(i + 1) % this.hull.length];
      if ((bx - ax) * (p.z - az) - (bz - az) * (p.x - ax) < 0) return true; // right of an edge: outside
    }
    return false;
  }
}

/** Andrew's monotone chain: the convex outline of the points, counter-clockwise. */
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

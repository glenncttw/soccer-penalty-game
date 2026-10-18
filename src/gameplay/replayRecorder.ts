import type { Vec3 } from '../physics/ballForces';
import type { KeeperPose, Quat } from '../physics/keeperBody';

/** Everything the replay needs to redraw one moment of a shot. */
export interface ReplayFrame {
  /** Game time (seconds): physics time, so a slowed-down goal still replays at an even speed. */
  t: number;
  ball: Vec3;
  spin: Quat;
  /** 1 = solid, 0 = faded out into the stands. */
  ballOpacity: number;
  keeper: KeeperPose;
}

const MAX_FRAMES = 2400; // 10 s at 240 frames a second: more than any shot lasts

/** Writes down where the ball and keeper are every frame of a shot, and plays it back smoothly. */
export class ReplayRecorder {
  readonly frames: ReplayFrame[] = [];
  /** Game time of the kick and of the moment the result was decided. */
  kickAt = 0;
  resultAt: number | null = null;

  start(t: number) {
    this.frames.length = 0;
    this.kickAt = t;
    this.resultAt = null;
  }

  record(t: number, ball: Vec3, spin: Quat, ballOpacity: number, keeper: KeeperPose) {
    if (this.frames.length >= MAX_FRAMES) return;
    const last = this.frames[this.frames.length - 1];
    if (last && t <= last.t) return; // a frame where game time stood still adds nothing
    this.frames.push({
      t,
      ball: { ...ball },
      spin: { x: spin.x, y: spin.y, z: spin.z, w: spin.w },
      ballOpacity,
      keeper: copyPose(keeper),
    });
  }

  markResult(t: number) {
    this.resultAt ??= t;
  }

  get endAt() {
    return this.frames.length ? this.frames[this.frames.length - 1].t : this.kickAt;
  }

  /** The recorded moment at game time `t`, blended between the two nearest frames, written into `out`. */
  sample(t: number, out: ReplayFrame): ReplayFrame {
    const f = this.frames;
    if (!f.length) return out;
    let hi = f.findIndex((frame) => frame.t >= t);
    if (hi <= 0) hi = hi === 0 ? 0 : f.length - 1;
    const a = f[Math.max(0, hi - 1)];
    const b = f[hi];
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    out.t = t;
    lerpPoint(out.ball, a.ball, b.ball, k);
    slerp(out.spin, a.spin, b.spin, k);
    out.ballOpacity = a.ballOpacity + (b.ballOpacity - a.ballOpacity) * k;
    lerpPoint(out.keeper.pivot, a.keeper.pivot, b.keeper.pivot, k);
    out.keeper.tilt = a.keeper.tilt + (b.keeper.tilt - a.keeper.tilt) * k;
    out.keeper.crouch = a.keeper.crouch + (b.keeper.crouch - a.keeper.crouch) * k;
    for (const i of [0, 1] as const) lerpPoint(out.keeper.gloves[i], a.keeper.gloves[i], b.keeper.gloves[i], k);
    return out;
  }
}

/** An empty frame to sample into. */
export function blankFrame(): ReplayFrame {
  const zero = () => ({ x: 0, y: 0, z: 0 });
  return {
    t: 0,
    ball: zero(),
    spin: { x: 0, y: 0, z: 0, w: 1 },
    ballOpacity: 1,
    keeper: { pivot: zero(), tilt: 0, gloves: [zero(), zero()], crouch: 0 },
  };
}

/**
 * Which part of the shot to replay, and how fast. It ends `afterResult` seconds after the result
 * and covers at most `duration` × `slowest` seconds of the shot, so the slowest replay lasts
 * `duration`; shorter shots play a little slower, down to `slowest`, to fill the time.
 */
export function replayWindow(
  kickAt: number,
  resultAt: number,
  endAt: number,
  s: { duration: number; slowest: number; fastest: number; afterResult: number },
) {
  const end = Math.min(endAt, resultAt + s.afterResult);
  const start = Math.max(kickAt, end - s.duration * s.fastest);
  const rate = Math.max(s.slowest, (end - start) / s.duration);
  return { start, end, rate, length: (end - start) / rate };
}

function copyPose(p: KeeperPose): KeeperPose {
  return { pivot: { ...p.pivot }, tilt: p.tilt, gloves: [{ ...p.gloves[0] }, { ...p.gloves[1] }], crouch: p.crouch };
}

function lerpPoint(out: Vec3, a: Vec3, b: Vec3, k: number) {
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.z = a.z + (b.z - a.z) * k;
}

/** Spherical blend between two rotations (the ball's spin), the short way round. */
function slerp(out: Quat, a: Quat, b: Quat, k: number) {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = cos < 0 ? -1 : 1;
  cos *= sign;
  let wa = 1 - k;
  let wb = k * sign;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    wa = Math.sin((1 - k) * angle) / sin;
    wb = (Math.sin(k * angle) / sin) * sign;
  }
  out.x = a.x * wa + b.x * wb;
  out.y = a.y * wa + b.y * wb;
  out.z = a.z * wa + b.z * wb;
  out.w = a.w * wa + b.w * wb;
  const n = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  out.x /= n;
  out.y /= n;
  out.z /= n;
  out.w /= n;
}

import type * as THREE from 'three';
import type { FrameSample, PerfStats } from './perfStats';

/**
 * The sharpness test panel, opened by adding ?bench to the game's address. Its buttons switch the pixel
 * ratio live (see src/scene/resolutionSettings.ts), and "Run test" measures each one in turn and shows a
 * table to screenshot or copy. Nothing here is visible without ?bench. ?bench&dpr=1.25 starts at 1.25.
 */
export interface BenchmarkParts {
  renderer: THREE.WebGLRenderer;
  perf: PerfStats;
  /** A pixel ratio to test, or null for the normal setting. The game keeps it under the screen's own. */
  setPixelRatio: (ratio: number | null) => void;
}

/** The pixel ratios the test runs through; 2 was the game's old setting. */
const TEST_RATIOS = [1, 1.25, 1.5, 2];
/** Seconds each ratio settles before measuring (the first frames after a change are slower), and measures. */
const SETTLE = 3;
const MEASURE = 10;

export interface BenchResult {
  ratio: number;
  /** Pixels drawn, wide x high. */
  width: number;
  height: number;
  frames: number;
  fps: number;
  frameMs: number;
  /** Frame time 99 frames in 100 are faster than, and the frame rate of the slowest 1% of frames. */
  p99Ms: number;
  low1Fps: number;
  cpuMs: number;
  /** GPU milliseconds per frame, where the browser can tell (most phones can't). */
  gpuMs: number | null;
  calls: number;
  triangles: number;
}

/** The numbers for one stretch of frames. */
export function summarize(
  ratio: number,
  size: { width: number; height: number },
  frames: FrameSample[],
  gpuMs: number[],
): BenchResult {
  const gaps: number[] = [];
  for (let i = 1; i < frames.length; i++) gaps.push(frames[i].time - frames[i - 1].time);
  const total = gaps.reduce((a, b) => a + b, 0);
  const sorted = [...gaps].sort((a, b) => a - b);
  const p99Ms = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] : 0;
  const worst = sorted.slice(Math.floor(sorted.length * 0.99));
  const worstMs = worst.length ? worst.reduce((a, b) => a + b, 0) / worst.length : 0;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    ratio,
    width: size.width,
    height: size.height,
    frames: gaps.length,
    fps: total > 0 ? (gaps.length * 1000) / total : 0,
    frameMs: mean(gaps),
    p99Ms,
    low1Fps: worstMs > 0 ? 1000 / worstMs : 0,
    cpuMs: mean(frames.map((f) => f.cpuMs)),
    gpuMs: gpuMs.length ? mean(gpuMs) : null,
    calls: Math.round(mean(frames.map((f) => f.calls))),
    triangles: Math.round(mean(frames.map((f) => f.triangles))),
  };
}

/** Short notes on what the numbers point to. */
export function readResults(results: BenchResult[]): string[] {
  if (!results.length) return [];
  const notes: string[] = [];
  const fps = results.map((r) => r.fps);
  const best = Math.max(...fps);
  const worst = Math.min(...fps);
  if (results.every((r) => Math.abs(r.fps - 30) < 1.5 && r.cpuMs < r.frameMs * 0.5)) {
    notes.push('Every setting sits at 30 FPS: the browser may be holding it there (iPhone: is Low Power Mode on?).');
  } else if (best - worst < best * 0.08) {
    notes.push('The frame rate hardly changes with sharpness: the pixels are not what holds it back.');
  } else {
    notes.push('Fewer pixels run faster: the graphics chip filling pixels is (part of) what holds it back.');
  }
  if (results.some((r) => r.cpuMs > r.frameMs * 0.75)) {
    notes.push("The game's own code takes most of each frame (CPU): fewer pixels won't fix that part.");
  }
  return notes;
}

/** Times the graphics chip's work per frame, where the browser allows it (desktop Chrome does, iPhones don't). */
class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private active: WebGLQuery | null = null;
  private waiting: WebGLQuery[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get supported() {
    return this.ext !== null;
  }

  begin() {
    if (!this.ext || this.active || this.waiting.length > 4) return;
    this.active = this.gl.createQuery();
    if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
  }

  end() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.waiting.push(this.active);
    this.active = null;
  }

  /** Milliseconds of the frames whose timing has come back since the last call. */
  collect(): number[] {
    const { gl, ext } = this;
    if (!ext) return [];
    const out: number[] = [];
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean; // timing was disturbed: throw it away
    while (this.waiting.length) {
      const q = this.waiting[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      if (!disjoint) out.push(ns / 1e6);
      gl.deleteQuery(q);
      this.waiting.shift();
    }
    return out;
  }
}

const fmt = (x: number, digits = 1) => x.toFixed(digits);
const ratioLabel = (r: number) => (Number.isInteger(r) ? r.toFixed(1) : String(r));

export function resultsText(results: BenchResult[], screenRatio: number): string {
  const lines = [
    `Soccer game bench, ${navigator.userAgent}`,
    `screen ${window.innerWidth}x${window.innerHeight} CSS px, devicePixelRatio ${screenRatio}`,
    'ratio | pixels | avg FPS | avg ms | 99% ms | 1% low FPS | CPU ms | GPU ms | draw calls | triangles',
    ...results.map((r) =>
      [
        ratioLabel(r.ratio),
        `${r.width}x${r.height}`,
        fmt(r.fps),
        fmt(r.frameMs),
        fmt(r.p99Ms),
        fmt(r.low1Fps),
        fmt(r.cpuMs),
        r.gpuMs === null ? 'n/a' : fmt(r.gpuMs),
        r.calls,
        r.triangles.toLocaleString('en'),
      ].join(' | '),
    ),
    ...readResults(results),
  ];
  return lines.join('\n');
}

export function openBenchmark({ renderer, perf, setPixelRatio }: BenchmarkParts) {
  const gpu = new GpuTimer(renderer);
  const canvas = renderer.domElement;
  const screenRatio = window.devicePixelRatio;
  const drawingSize = () => ({ width: canvas.width, height: canvas.height });
  const panel = document.createElement('div');
  panel.className = 'bench';
  panel.innerHTML = `
    <b>Sharpness test</b>
    <div class="bench-buttons"></div>
    <pre class="bench-live"></pre>
    <button class="bench-run">Run test (about 1 minute)</button>
    <pre class="bench-results"></pre>
    <button class="bench-copy" hidden>Copy results</button>`;
  // The panel takes taps, so a tap on it never starts a shot.
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(panel);
  const live = panel.querySelector<HTMLElement>('.bench-live')!;
  const out = panel.querySelector<HTMLElement>('.bench-results')!;
  const run = panel.querySelector<HTMLButtonElement>('.bench-run')!;
  const copy = panel.querySelector<HTMLButtonElement>('.bench-copy')!;

  let chosen: number | null = null;
  const buttons = new Map<number | null, HTMLButtonElement>();
  const choose = (ratio: number | null) => {
    chosen = ratio;
    setPixelRatio(ratio);
    for (const [r, b] of buttons) b.classList.toggle('on', r === ratio);
  };
  const row = panel.querySelector<HTMLElement>('.bench-buttons')!;
  for (const ratio of [null, ...TEST_RATIOS]) {
    const b = document.createElement('button');
    b.textContent = ratio === null ? 'Normal' : ratioLabel(ratio);
    b.disabled = ratio !== null && ratio > screenRatio;
    b.addEventListener('click', () => choose(ratio));
    row.appendChild(b);
    buttons.set(ratio, b);
  }
  const start = Number(new URLSearchParams(location.search).get('dpr'));
  choose(start > 0 ? start : null);

  // The live line: the last second's numbers, updated once a second.
  let second: FrameSample[] = [];
  let secondGpu: number[] = [];
  // What a test run is collecting, if one is running.
  let collecting: { frames: FrameSample[]; gpu: number[] } | null = null;
  perf.onFrameStart = () => gpu.begin();
  perf.onFrame = (frame) => {
    gpu.end();
    const gpuMs = gpu.collect();
    second.push(frame);
    secondGpu.push(...gpuMs);
    if (collecting) {
      collecting.frames.push(frame);
      collecting.gpu.push(...gpuMs);
    }
    if (frame.time - second[0].time < 1000) return;
    const r = summarize(chosen ?? 0, drawingSize(), second, secondGpu);
    live.textContent = [
      `drawing ${canvas.width}x${canvas.height} px @ ${renderer.getPixelRatio()}x (screen ${screenRatio}x)`,
      `${fmt(r.fps)} FPS, ${fmt(r.frameMs)} ms a frame, CPU ${fmt(r.cpuMs)} ms`,
      `GPU ${gpu.supported ? (r.gpuMs === null ? '...' : `${fmt(r.gpuMs)} ms`) : 'n/a in this browser'}`,
    ].join('\n');
    second = [];
    secondGpu = [];
  };

  const wait = (seconds: number) => new Promise((done) => setTimeout(done, seconds * 1000));
  run.addEventListener('click', async () => {
    const before = chosen;
    run.disabled = true;
    copy.hidden = true;
    const results: BenchResult[] = [];
    const ratios = TEST_RATIOS.filter((r) => r <= screenRatio);
    for (const [i, ratio] of ratios.entries()) {
      choose(ratio);
      out.textContent = `Testing ${ratioLabel(ratio)} (${i + 1} of ${ratios.length})... don't touch the screen`;
      await wait(SETTLE);
      collecting = { frames: [], gpu: [] };
      await wait(MEASURE);
      results.push(summarize(ratio, drawingSize(), collecting.frames, collecting.gpu));
      collecting = null;
    }
    choose(before);
    out.textContent = resultsText(results, screenRatio);
    run.disabled = false;
    copy.hidden = false;
  });
  copy.addEventListener('click', () => {
    navigator.clipboard?.writeText(out.textContent ?? '').then(
      () => (copy.textContent = 'Copied!'),
      () => (copy.textContent = 'Copy failed: take a screenshot'),
    );
  });
}

import type { RenderProfiler } from '../scene/renderPipeline';

/**
 * Measures how long the graphics card spends on each stage of a frame, with WebGL's timer
 * queries. Results arrive a few frames late and are smoothed. Not every browser offers the
 * queries (Firefox and Safari usually don't); then `available` is false and nothing is measured.
 */
export class GpuTimer implements RenderProfiler {
  /** Smoothed milliseconds per stage. */
  private readonly ms = new Map<string, number>();
  /** The stages of the last frame, in the order they ran (an effect that's off has no stage). */
  private stages: string[] = [];
  private nextStages: string[] = [];
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly pending: { stage: string; query: WebGLQuery }[] = [];
  private readonly spare: WebGLQuery[] = [];
  private active: { stage: string; query: WebGLQuery } | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get available() {
    return this.ext !== null;
  }

  /** [stage, milliseconds] for each stage of the last frame that has a result yet. */
  results(): [string, number][] {
    return this.stages.filter((s) => this.ms.has(s)).map((s) => [s, this.ms.get(s)!]);
  }

  /** The whole frame on the graphics card. */
  get totalMs() {
    return this.results().reduce((sum, [, ms]) => sum + ms, 0);
  }

  begin(stage: string) {
    if (!this.ext) return;
    this.stop();
    const query = this.spare.pop() ?? this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = { stage, query };
    this.nextStages.push(stage);
  }

  end() {
    this.stop();
    this.collect();
    this.stages = this.nextStages;
    this.nextStages = [];
  }

  private stop() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  private collect() {
    const gl = this.gl;
    // A disjoint event (power saving, another app) makes the current results meaningless.
    const disjoint = gl.getParameter(this.ext!.GPU_DISJOINT_EXT);
    while (this.pending.length > 0) {
      const { stage, query } = this.pending[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        const before = this.ms.get(stage);
        this.ms.set(stage, before === undefined ? ms : before * 0.95 + ms * 0.05);
      }
      this.spare.push(query);
    }
  }
}

import type * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';

/** One frame's numbers, for the ?bench panel. */
export interface FrameSample {
  /** When the frame started, in milliseconds (the animation loop's time). */
  time: number;
  /** Milliseconds the game's own code took this frame, drawing included (the CPU side). */
  cpuMs: number;
  calls: number;
  triangles: number;
}

/**
 * Performance numbers in the bottom left corner: three.js's standard
 * Stats panel (click it to switch between FPS, milliseconds per frame and memory) and a line of
 * what the renderer drew in the last frame, updated twice a second.
 */
export class PerfStats {
  private readonly stats = new Stats();
  private readonly text = document.createElement('div');
  private since: number | null = null;
  private frameStart = 0;
  private frameTime = 0;
  /** Called at the start and end of every frame (used by the ?bench panel). */
  onFrameStart: (() => void) | null = null;
  onFrame: ((frame: FrameSample) => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    // The replay draws more than once a frame, so count everything until the next frame starts.
    renderer.info.autoReset = false;
    const panel = this.stats.dom;
    panel.style.top = 'auto';
    panel.style.bottom = '12px';
    panel.style.left = '12px';
    document.body.appendChild(panel); // not in the HUD: the panel takes clicks
    this.text.className = 'perf';
    root.appendChild(this.text);
  }

  /** Call at the start of each frame, with the animation loop's time. */
  begin(time: number) {
    this.renderer.info.reset();
    this.stats.begin();
    this.frameTime = time;
    this.frameStart = performance.now();
    this.onFrameStart?.();
  }

  /** Call at the end of each frame, after drawing, with the frame's time in milliseconds. */
  end(now: number) {
    this.stats.end();
    const { render } = this.renderer.info;
    this.onFrame?.({
      time: this.frameTime,
      cpuMs: performance.now() - this.frameStart,
      calls: render.calls,
      triangles: render.triangles,
    });
    if (this.since !== null && now - this.since < 500) return;
    this.since = now;
    const { memory, programs } = this.renderer.info;
    const canvas = this.renderer.domElement;
    this.text.textContent = [
      `draw calls ${render.calls}`,
      `triangles ${render.triangles.toLocaleString('en')}`,
      `lines ${render.lines}  points ${render.points}`,
      `geometries ${memory.geometries}  textures ${memory.textures}`,
      `shaders ${programs?.length ?? 0}`,
      `${canvas.width}x${canvas.height} px @ ${this.renderer.getPixelRatio()}x`,
    ].join('\n');
  }
}

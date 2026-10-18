import type * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';

/**
 * Performance numbers in the bottom left corner, above the FPS counter: three.js's standard
 * Stats panel (click it to switch between FPS, milliseconds per frame and memory) and a line of
 * what the renderer drew in the last frame, updated twice a second.
 */
export class PerfStats {
  private readonly stats = new Stats();
  private readonly text = document.createElement('div');
  private since: number | null = null;

  constructor(
    root: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    // The replay draws more than once a frame, so count everything until the next frame starts.
    renderer.info.autoReset = false;
    const panel = this.stats.dom;
    panel.style.top = 'auto';
    panel.style.bottom = '44px';
    panel.style.left = '12px';
    document.body.appendChild(panel); // not in the HUD: the panel takes clicks
    this.text.className = 'perf';
    root.appendChild(this.text);
  }

  /** Call at the start of each frame. */
  begin() {
    this.renderer.info.reset();
    this.stats.begin();
  }

  /** Call at the end of each frame, after drawing, with the frame's time in milliseconds. */
  end(now: number) {
    this.stats.end();
    if (this.since !== null && now - this.since < 500) return;
    this.since = now;
    const { render, memory, programs } = this.renderer.info;
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

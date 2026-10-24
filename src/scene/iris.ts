import * as THREE from 'three';
import { HOLE_EDGE, holeRadius, type PurpleTunnel } from './introBackdrop';

export interface IrisParts {
  renderer: THREE.WebGLRenderer;
  /** The landing's purple tunnel: the replay's background, so the circle closes onto just what the replay shows. */
  tunnel: PurpleTunnel;
  /** The game's camera: the tunnel is seen through its lens, as in the replay. */
  camera: THREE.PerspectiveCamera;
  /** Reduced motion: the purple fades in and out instead, its rings standing still. */
  still: boolean;
}

type State = 'open' | 'closing' | 'shut' | 'opening';

/**
 * The circle transition around the replay, like the landing's: the purple tunnel closes in over the field as a
 * shrinking circle and, later, opens up again as a growing one. While it's shut (all purple), whatever is
 * behind it can change without anyone seeing.
 */
export class Iris {
  private state: State = 'open';
  private t = 0;
  private time = 1;
  /** Where the circle closes to or opens from, in CSS pixels from the top left. */
  private readonly centre = new THREE.Vector2();
  private done: () => void = () => {};
  private readonly size = new THREE.Vector2();

  constructor(
    private readonly parts: IrisParts,
    /** How fast the tunnel's rings come toward you, in times the landing's pace (as in the replay). */
    private readonly speed: () => number = () => 1,
  ) {}

  /** True while it closes or opens. */
  get running() {
    return this.state === 'closing' || this.state === 'opening';
  }

  /** Closes in on (`x`, `y`) in CSS pixels over `time` seconds, then calls `onShut` (the screen is all purple then). */
  close(x: number, y: number, time: number, onShut: () => void = () => {}) {
    this.start('closing', x, y, time, onShut);
  }

  /** Opens up from (`x`, `y`) in CSS pixels over `time` seconds, then calls `onOpen`. */
  open(x: number, y: number, time: number, onOpen: () => void = () => {}) {
    this.start('opening', x, y, time, onOpen);
  }

  /** Moves it on by `dt` seconds; calls `onShut` or `onOpen` once it gets there. */
  update(dt: number) {
    if (!this.running) return;
    this.t = Math.min(1, this.t + dt / this.time);
    if (this.t < 1) return;
    this.state = this.state === 'closing' ? 'shut' : 'open';
    this.done();
  }

  /** How much of the field shows: 0 all purple, 1 none of it purple. */
  get reveal() {
    const u = this.t;
    switch (this.state) {
      case 'open':
        return 1;
      case 'shut':
        return 0;
      case 'closing':
        return 1 - (1 - Math.cos(Math.PI * u)) / 2; // gentle start and stop
      case 'opening':
        return 1 - (1 - u) ** 3; // quick, then slowing down: like the landing's
    }
  }

  /** Draws the purple over what's on screen (call after drawing the game), moving its rings on by `dt` seconds. */
  render(dt: number) {
    const reveal = this.reveal;
    if (reveal >= 1) return;
    const { renderer, tunnel, camera, still } = this.parts;
    renderer.getDrawingBufferSize(this.size);
    const pixels = this.size.y / renderer.domElement.clientHeight || 1;
    const x = this.centre.x * pixels;
    const y = this.size.y - this.centre.y * pixels; // the drawing counts up from the bottom
    const radius = holeRadius(still ? 0 : reveal, x, y, this.size.x, this.size.y, HOLE_EDGE * pixels);
    tunnel.uniforms.uHole.value.set(x, y, radius);
    tunnel.uniforms.uOpacity.value = still ? 1 - reveal : 1;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    tunnel.drawStraight(renderer, camera, still ? 0 : dt, this.speed());
    renderer.autoClear = autoClear;
  }

  private start(state: State, x: number, y: number, time: number, done: () => void) {
    this.state = state;
    this.t = 0;
    this.time = Math.max(1e-3, time);
    this.centre.set(x, y);
    this.done = done;
  }
}

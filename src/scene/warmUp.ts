import * as THREE from 'three';

const FRAME_SHARE = 6; // milliseconds of a frame for getting materials ready

/**
 * Gets every material in a scene ready to draw (its shaders made, its pictures sent to the graphics chip) a few
 * at a time, as many as fit in a few milliseconds of each frame (at least one), so a page that keeps drawing
 * meanwhile (the landing) only ever stops for a moment, not for all of them at once. Call `step` every frame,
 * before the frame's own drawing (which covers up what `step` drew); `done` resolves when all are ready.
 *
 * Each material is drawn the two ways the game draws it: on screen, and into a picture (as the replay does,
 * which needs its own version of the shaders). Both only one pixel big: the size doesn't change the shaders,
 * and that keeps the drawing itself quick.
 */
export class GradualWarmUp {
  readonly done: Promise<void>;
  private resolve!: () => void;
  private readonly todo: THREE.Object3D[][];
  private readonly shown = new Map<THREE.Object3D, boolean>();
  private readonly picture = new THREE.WebGLRenderTarget(1, 1);
  private readonly viewport = new THREE.Vector4();
  private finished = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.done = new Promise((resolve) => (this.resolve = resolve));
    this.picture.texture.colorSpace = THREE.SRGBColorSpace;
    const byMaterial = new Map<THREE.Material, THREE.Object3D[]>();
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line)) return;
      this.shown.set(o, o.visible);
      for (const m of [o.material as THREE.Material | THREE.Material[]].flat()) {
        if (!byMaterial.has(m)) byMaterial.set(m, []);
        byMaterial.get(m)!.push(o);
      }
    });
    this.todo = [...byMaterial.values()];
    this.finishIfDone();
  }

  /** Gets the next few materials ready. */
  step() {
    const start = performance.now();
    do this.next();
    while (this.todo.length > 0 && performance.now() - start < FRAME_SHARE);
    this.finishIfDone();
  }

  /** Draws the next material's objects (and nothing else, but the lights). */
  private next() {
    const objects = this.todo.shift();
    if (!objects) return;
    for (const o of this.shown.keys()) o.visible = false;
    for (const o of objects) o.visible = this.shown.get(o)!;
    const { renderer } = this;
    // Not the sun's shadows: with only part of the scene drawn they'd be wrong until the next full drawing.
    renderer.shadowMap.autoUpdate = false;
    renderer.getViewport(this.viewport);
    renderer.setViewport(0, 0, 1, 1);
    renderer.render(this.scene, this.camera);
    renderer.setViewport(this.viewport);
    renderer.setRenderTarget(this.picture);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = true;
    for (const [o, visible] of this.shown) o.visible = visible;
  }

  private finishIfDone() {
    if (this.todo.length > 0 || this.finished) return;
    this.finished = true;
    this.picture.dispose();
    this.resolve();
  }
}

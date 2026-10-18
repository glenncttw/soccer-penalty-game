import * as THREE from 'three';

/** Seconds the ball takes to fade out after flying over the boards. */
const FADE_TIME = 0.35;

/** Fades the ball out when it flies into the stands, and brings it back for the next shot. */
export class BallFade {
  fading = false;
  private opacity = 1;
  private readonly materials: THREE.Material[] = [];

  constructor(private readonly ball: THREE.Object3D) {
    ball.traverse((o) => {
      if (o instanceof THREE.Mesh) this.materials.push(...[o.material].flat());
    });
  }

  start() {
    if (this.fading) return;
    this.fading = true;
    this.setTransparent(true);
  }

  update(dt: number) {
    if (!this.fading || this.opacity === 0) return;
    this.opacity = Math.max(0, this.opacity - dt / FADE_TIME);
    for (const m of this.materials) m.opacity = this.opacity;
    this.ball.visible = this.opacity > 0; // also takes its shadow away
  }

  /** How solid the ball is now: 1 = solid, 0 = gone. */
  get shown() {
    return this.opacity;
  }

  /** Holds the ball at `opacity` (the replay uses this to show a recorded fade). */
  showAt(opacity: number) {
    const see = opacity < 1;
    if (see !== this.fading) {
      this.fading = see;
      this.setTransparent(see);
    }
    this.opacity = opacity;
    for (const m of this.materials) m.opacity = opacity;
    this.ball.visible = opacity > 0;
  }

  reset() {
    if (!this.fading) return;
    this.fading = false;
    this.opacity = 1;
    for (const m of this.materials) m.opacity = 1;
    this.setTransparent(false); // a solid ball again, drawn like before
    this.ball.visible = true;
  }

  private setTransparent(on: boolean) {
    for (const m of this.materials) {
      m.transparent = on;
      m.needsUpdate = true;
    }
  }
}

import * as THREE from 'three';

// Lighting matched to the Blender scene (see the stadium's THREEJS_NOTES.md):
// the exported sun plus a hemisphere fill equal to Blender's world strength
// (1.15 x PI, since Three.js does not multiply ambient light by PI).
const AMBIENT_SKY = 0xedf2f9;
const AMBIENT_GROUND = 0xdcd6cb;
const AMBIENT_INTENSITY = 3.6;
const SKY_GRADIENT = ['#1E97FA', '#40A7FB', '#8FD0FB']; // top, middle, horizon

export function setUpLighting(scene: THREE.Scene, sun: THREE.DirectionalLight | null) {
  scene.add(new THREE.HemisphereLight(AMBIENT_SKY, AMBIENT_GROUND, AMBIENT_INTENSITY));
  scene.background = skyGradient();

  if (sun) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
}

function skyGradient(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, SKY_GRADIENT[0]);
  g.addColorStop(0.55, SKY_GRADIENT[1]);
  g.addColorStop(1, SKY_GRADIENT[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

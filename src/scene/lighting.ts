import * as THREE from 'three';

// Lighting matched to the Blender scene (see the stadium's THREEJS_NOTES.md):
// the exported sun plus a hemisphere fill equal to Blender's world strength
// (1.15 x PI, since Three.js does not multiply ambient light by PI).
// The sky you see is drawn separately, in sky.ts.
const AMBIENT_SKY = 0xedf2f9;
const AMBIENT_GROUND = 0xdcd6cb;
const AMBIENT_INTENSITY = 3.6;

export function setUpLighting(scene: THREE.Scene, sun: THREE.DirectionalLight | null) {
  scene.add(new THREE.HemisphereLight(AMBIENT_SKY, AMBIENT_GROUND, AMBIENT_INTENSITY));

  if (sun) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
}

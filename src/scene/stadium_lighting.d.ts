// Types for stadium_lighting.js, which comes with the Blender stadium package. One change of ours:
// loadStadiumLighting (download every bake at once, before the model is in), which setupStadiumLighting
// takes as its last argument. Keep it when a new package replaces the file.
import type * as THREE from 'three';

export interface StadiumLightingOptions {
  /** URL of the bakes folder, ending in "/". */
  bakes?: string;
  /** "ktx2" (default) or the "webp" fallback pictures. */
  format?: 'ktx2' | 'webp';
  /** Load the 2.3 MB higher-quality stands picture instead of the 0.55 MB one. */
  standsHQ?: boolean;
  /** URL of the folder with basis_transcoder.js and .wasm, ending in "/". */
  basisPath?: string;
  sunShadowMapSize?: number;
  /** Show STATIC_Markings instead of hiding it. */
  showMarkings?: boolean;
}

/** The baked textures (by name) and the panorama, downloaded. */
export interface StadiumLightingFiles {
  textures: Map<string, THREE.Texture>;
  exr: THREE.DataTexture;
}

export function loadStadiumLighting(
  renderer: THREE.WebGLRenderer,
  opts?: StadiumLightingOptions,
): Promise<StadiumLightingFiles>;

export function setupStadiumLighting(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  opts?: StadiumLightingOptions,
  loading?: Promise<StadiumLightingFiles>,
): Promise<{ sun: THREE.DirectionalLight | null; envMap: THREE.Texture }>;

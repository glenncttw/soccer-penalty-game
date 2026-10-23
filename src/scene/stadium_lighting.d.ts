// Types for stadium_lighting.js, which comes with the Blender stadium package. One change of ours:
// loadStadiumBakes and loadStadiumPanorama (download the bakes all at once and the panorama, before the
// model is in), which setupStadiumLighting takes as its last argument. Keep them when a new package
// replaces the file.
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

/** The baked textures by name, and the panorama's soft light and reflections. */
export interface StadiumLightingFiles {
  bakes?: Promise<Map<string, THREE.Texture>>;
  envMap?: Promise<THREE.Texture>;
}

export function loadStadiumBakes(
  renderer: THREE.WebGLRenderer,
  opts?: StadiumLightingOptions,
): Promise<Map<string, THREE.Texture>>;

export function loadStadiumPanorama(
  renderer: THREE.WebGLRenderer,
  opts?: StadiumLightingOptions,
): Promise<THREE.Texture>;

export function setupStadiumLighting(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  opts?: StadiumLightingOptions,
  files?: StadiumLightingFiles,
): Promise<{ sun: THREE.DirectionalLight | null; envMap: THREE.Texture }>;

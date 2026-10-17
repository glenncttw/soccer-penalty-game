// Types for stadium_lighting.js, which comes with the Blender stadium package
// unchanged, so a new package can replace it as it is.
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

export function setupStadiumLighting(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  opts?: StadiumLightingOptions,
): Promise<{ sun: THREE.DirectionalLight | null; envMap: THREE.Texture }>;

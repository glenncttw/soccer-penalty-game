import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { CAMERA_SETTINGS, type CameraSettings } from '../scene/cameraSettings';
import { GRASS_SETTINGS, type GrassSettings } from '../scene/grassSettings';
import { REPLAY_SETTINGS, type ReplaySettings } from '../scene/replaySettings';
import { settingsSnippet } from './settingsSnippet';

/** A slider: [setting, label, min, max, step]. A colour: [setting, label]. */
type Row<T> = [keyof T & string, string] | [keyof T & string, string, number, number, number];

const CAMERA_ROWS: Row<CameraSettings>[] = [
  ['height', 'Height (m)', 0.3, 2.5, 0.01],
  ['distanceBehindBall', 'Behind the ball (m)', 1, 10, 0.05],
  ['targetHeight', 'Looks at height (m)', -1, 2.5, 0.01],
  ['fov', 'Field of view (°)', 15, 60, 0.1],
  ['verticalShift', 'Slide picture up', -0.25, 0.25, 0.005],
];

const GRASS_ROWS: Record<string, Row<GrassSettings>[]> = {
  Stripes: [
    ['colorLight', 'Light colour'],
    ['colorDark', 'Dark colour'],
    ['stripeSoftness', 'Edge softness', 0, 0.3, 0.005],
    ['stripeRagged', 'Ragged edges', 0, 0.15, 0.005],
  ],
  'Cross stripes': [
    ['crossStripeWidth', 'Width (m)', 0, 5, 0.05],
    ['crossStripeOpacity', 'Opacity', 0, 1, 0.01],
  ],
  Texture: [
    ['textureTileSize', 'Tile size (m)', 0.1, 2, 0.01],
    ['textureStretch', 'Stretch to goal', 1, 6, 0.1],
    ['textureStrength', 'Colour detail', 0, 2, 0.01],
    ['normalStrength', 'Bumps', 0, 6, 0.05],
  ],
  Shading: [
    ['patchStrength', 'Patches', 0, 0.3, 0.005],
    ['patchSize', 'Patch size (m)', 0.2, 10, 0.1],
    ['angleShading', 'Viewing angle', 0, 1, 0.01],
    ['farLight', 'Far grass lighter', 0, 1, 0.01],
    ['contactShadow', 'Contact shadows', 0, 1, 0.01],
  ],
  'Painted lines': [
    ['lineColor', 'Colour'],
    ['lineRagged', 'Ragged edges', 0, 0.15, 0.005],
    ['lineWobble', 'Wavy edges (m)', 0, 0.1, 0.005],
    ['lineTexture', 'Grass texture through', 0, 1, 0.01],
    ['lineGrassTint', 'Green through', 0, 0.5, 0.01],
  ],
};

const WIPE_ROWS: Row<ReplaySettings>[] = [
  ['wipeTime', 'Sweep time (s)', 0.3, 2, 0.01],
];

export interface EditorTargets {
  camera: { setSettings(settings: CameraSettings): void };
  /** The camera from the Blender scene, for "Use Blender camera". */
  blenderCamera: CameraSettings;
  grass: { update(settings: GrassSettings): void };
  /** Plays the wipe once, to try its timing. */
  wipe: { play(): void };
}

/**
 * A panel for changing the camera and the grass while the game runs. Open it by adding ?edit to
 * the game's address. Changes are only kept until you reload: "Copy settings"
 * copies them as code, to paste into the settings file.
 */
export function openSettingsEditor(targets: EditorTargets) {
  injectStyles();
  const gui = new GUI({ title: 'Settings editor', width: 300 });
  if (window.innerWidth < 600) gui.close(); // don't cover a phone screen until asked

  const camera = { ...CAMERA_SETTINGS };
  const cameraFolder = gui.addFolder('Camera');
  const applyCamera = () => targets.camera.setSettings(camera);
  for (const row of CAMERA_ROWS) addRow(cameraFolder, camera, row).onChange(applyCamera);
  addCopyButton(cameraFolder, 'Copy camera settings', () => settingsSnippet('CAMERA_SETTINGS', 'CameraSettings', camera));
  cameraFolder.add({ reset: () => cameraFolder.reset() }, 'reset').name('Reset camera');
  const useBlender = () => {
    Object.assign(camera, targets.blenderCamera);
    for (const c of cameraFolder.controllers) c.updateDisplay();
    applyCamera();
  };
  cameraFolder.add({ useBlender }, 'useBlender').name('Use Blender camera');

  const grass = { ...GRASS_SETTINGS };
  const grassFolder = gui.addFolder('Grass');
  for (const [title, rows] of Object.entries(GRASS_ROWS)) {
    const folder = grassFolder.addFolder(title);
    for (const row of rows) addRow(folder, grass, row).onChange(() => targets.grass.update(grass));
  }
  addCopyButton(grassFolder, 'Copy grass settings', () => settingsSnippet('GRASS_SETTINGS', 'GrassSettings', grass));
  grassFolder.add({ reset: () => grassFolder.reset() }, 'reset').name('Reset grass');

  // The wipe reads its timing each time it plays, so these sliders change it straight away.
  const wipeFolder = gui.addFolder('Wipe');
  for (const row of WIPE_ROWS) addRow(wipeFolder, REPLAY_SETTINGS, row);
  wipeFolder.add({ play: () => targets.wipe.play() }, 'play').name('Play wipe');
  addCopyButton(wipeFolder, 'Copy replay settings', () =>
    settingsSnippet('REPLAY_SETTINGS', 'ReplaySettings', REPLAY_SETTINGS),
  );
  wipeFolder.add({ reset: () => wipeFolder.reset() }, 'reset').name('Reset wipe');
  return gui;
}

function addRow<T extends object>(folder: GUI, settings: T, row: Row<T>) {
  const [key, label, min, max, step] = row;
  const controller =
    min === undefined
      ? folder.addColor(settings as unknown as Record<string, string>, key)
      : folder.add(settings as unknown as Record<string, number>, key, min, max, step);
  controller.domElement.title = key; // the setting's name in the settings file
  return controller.name(label);
}

function addCopyButton(folder: GUI, label: string, text: () => string) {
  const button = folder.add({ copy: () => copy(text()) }, 'copy').name(label);
  async function copy(snippet: string) {
    try {
      await navigator.clipboard.writeText(snippet);
      button.name('Copied!');
      setTimeout(() => button.name(label), 1500);
    } catch {
      window.prompt('Copy these settings:', snippet);
    }
  }
}

// The page blocks text selection and touch scrolling for the game; the panel needs both.
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = '.lil-gui { touch-action: auto; user-select: auto; -webkit-user-select: auto; }';
  document.head.append(style);
}

import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { GRASS_SETTINGS, type GrassSettings } from '../scene/grassSettings';
import { settingsSnippet } from './settingsSnippet';

/** A slider: [setting, label, min, max, step]. A colour: [setting, label]. */
type Row<T> = [keyof T & string, string] | [keyof T & string, string, number, number, number];

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
  ],
  'Painted lines': [
    ['lineColor', 'Colour'],
    ['lineRagged', 'Ragged edges', 0, 0.15, 0.005],
  ],
};

export interface EditorTargets {
  grass: { update(settings: GrassSettings): void };
}

/**
 * A panel for changing settings while the game runs. Open it by adding ?edit to
 * the game's address. Changes are only kept until you reload: "Copy settings"
 * copies them as code, to paste into the settings file.
 */
export function openSettingsEditor(targets: EditorTargets) {
  injectStyles();
  const gui = new GUI({ title: 'Settings editor', width: 300 });
  if (window.innerWidth < 600) gui.close(); // don't cover a phone screen until asked

  const grass = { ...GRASS_SETTINGS };
  const grassFolder = gui.addFolder('Grass');
  for (const [title, rows] of Object.entries(GRASS_ROWS)) {
    const folder = grassFolder.addFolder(title);
    for (const row of rows) addRow(folder, grass, row).onChange(() => targets.grass.update(grass));
  }
  addCopyButton(grassFolder, 'Copy grass settings', () => settingsSnippet('GRASS_SETTINGS', 'GrassSettings', grass));
  grassFolder.add({ reset: () => grassFolder.reset() }, 'reset').name('Reset grass');
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

import type * as THREE from 'three';
import type { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import type { RenderPipeline } from '../scene/renderPipeline';
import { RENDER_PRESETS, type RenderSettings, type ToneMappingMode } from '../scene/renderSettings';
import { GpuTimer } from './gpuTimer';
import { addCopyButton, addRow, type Row } from './settingsEditor';
import { settingsSnippet } from './settingsSnippet';

const TONE_MAPPING: Record<string, ToneMappingMode> = { None: 'none', 'Neutral (Khronos PBR)': 'neutral', ACES: 'aces', AgX: 'agx' };

const GRADING_ROWS: Row<RenderSettings>[] = [
  ['saturation', 'Saturation', 0, 2, 0.01],
  ['contrast', 'Contrast', 0, 2, 0.01],
  ['warmth', 'Warmth', -0.3, 0.3, 0.005],
  ['shadowLift', 'Shadow lift', 0, 0.15, 0.005],
  ['shadowTint', 'Shadow tint'],
];
const BLOOM_ROWS: Row<RenderSettings>[] = [
  ['bloomStrength', 'Strength', 0, 8, 0.05],
  ['bloomThreshold', 'Threshold', 0.3, 5, 0.05],
  ['bloomRadius', 'Radius', 0, 1, 0.01],
];
const DOF_ROWS: Row<RenderSettings>[] = [
  ['depthOfFieldStrength', 'Strength', 0, 1, 0.01],
  ['depthOfFieldRange', 'Builds up over (m)', 1, 40, 0.5],
];
const ATMOSPHERE_ROWS: Row<RenderSettings>[] = [
  ['atmosphere', 'Amount (0 = off)', 0, 0.6, 0.005],
  ['atmosphereColor', 'Colour'],
  ['atmosphereStart', 'Starts at (m)', 0, 60, 0.5],
  ['atmosphereEnd', 'Full amount at (m)', 5, 120, 0.5],
];

/** What the panel needs from a lil-gui controller, whatever kind of value it shows. */
interface Control {
  updateDisplay(): unknown;
  onChange(callback: () => void): unknown;
}

/** Presets saved with "Save as preset", kept in this browser only. */
const STORAGE_KEY = 'penalty:renderPresets';

/**
 * The Rendering folder of the settings editor: tone mapping, grading, effects, presets and
 * performance figures. Only in development (`npm run dev`, then add ?edit to the address).
 */
export function addRenderingPanel(gui: GUI, pipeline: RenderPipeline, renderer: THREE.WebGLRenderer) {
  const settings: RenderSettings = { ...pipeline.current };
  // Also reachable from the browser console, to try settings by hand: renderPipeline.setSettings({ ... }).
  Object.assign(window, { renderPipeline: pipeline });
  const folder = gui.addFolder('Rendering (dev only)');
  const apply = () => pipeline.setSettings(settings);
  const all: Control[] = [];
  const track = (c: Control) => {
    all.push(c);
    c.onChange(apply);
  };

  // Presets: the two built in, plus any saved in this browser.
  const saved = loadPresets();
  const choice = { preset: 'Polished' };
  const presetNames = () => [...Object.keys(RENDER_PRESETS), ...Object.keys(saved)];
  const presets = () => ({ ...RENDER_PRESETS, ...saved });
  let presetControl = folder.add(choice, 'preset', presetNames()).name('Preset');
  const usePreset = (name: string) => {
    const preset = presets()[name];
    if (!preset) return;
    Object.assign(settings, RENDER_PRESETS.Polished, preset); // a preset saved before a setting existed keeps its default
    for (const c of all) c.updateDisplay();
    apply();
  };
  presetControl.onChange(usePreset);
  const refreshPresets = () => {
    // options() swaps in a new dropdown in the same place.
    presetControl = presetControl.options(presetNames()) as unknown as typeof presetControl;
    presetControl.name('Preset').onChange(usePreset);
    presetControl.setValue(choice.preset);
  };
  folder
    .add({ save: () => {
      const name = window.prompt('Name for this preset:')?.trim();
      if (!name || name in RENDER_PRESETS) return;
      saved[name] = { ...settings };
      storePresets(saved);
      choice.preset = name;
      refreshPresets();
    } }, 'save')
    .name('Save as preset…');
  folder
    .add({ remove: () => {
      if (!(choice.preset in saved)) return; // the built-in presets stay
      delete saved[choice.preset];
      storePresets(saved);
      choice.preset = 'Polished';
      refreshPresets();
    } }, 'remove')
    .name('Delete saved preset');
  addCopyButton(folder, 'Copy render settings', () => settingsSnippet('RENDER_SETTINGS', 'RenderSettings', settings));

  const tone = folder.addFolder('Tone mapping');
  track(tone.add(settings, 'toneMapping', TONE_MAPPING).name('Curve'));
  track(addRow(tone, settings, ['exposure', 'Exposure', 0.3, 2.5, 0.01]));

  const grading = folder.addFolder('Colour grading');
  for (const row of GRADING_ROWS) track(addRow(grading, settings, row));

  const bloom = folder.addFolder('Bloom');
  track(bloom.add(settings, 'bloom').name('On'));
  for (const row of BLOOM_ROWS) track(addRow(bloom, settings, row));

  const dof = folder.addFolder('Depth of field');
  track(dof.add(settings, 'depthOfField').name('On'));
  for (const row of DOF_ROWS) track(addRow(dof, settings, row));
  dof.close();

  const haze = folder.addFolder('Atmosphere');
  for (const row of ATMOSPHERE_ROWS) track(addRow(haze, settings, row));
  haze.close();

  const finish = folder.addFolder('Dithering and grain');
  track(finish.add(settings, 'dithering').name('Dithering'));
  track(addRow(finish, settings, ['grain', 'Grain', 0, 0.1, 0.001]));
  finish.close();

  const quality = folder.addFolder('Edges and resolution');
  track(quality.add(settings, 'antialiasSamples', { Off: 0, '2x MSAA': 2, '4x MSAA': 4, '8x MSAA': 8 }).name('Edge smoothing'));
  // A new pixel ratio resizes the canvas, which the game handles in its resize listener.
  const ratio = addRow(quality, settings, ['maxPixelRatio', 'Max pixel ratio', 0.5, 3, 0.25]);
  all.push(ratio);
  ratio.onChange(() => {
    apply();
    window.dispatchEvent(new Event('resize'));
  });
  quality.close();

  addPerformance(folder, pipeline, renderer);
  return folder;
}

/** Live figures: GPU time per stage (if the browser can measure it), frame time, draw calls and memory. */
function addPerformance(folder: GUI, pipeline: RenderPipeline, renderer: THREE.WebGLRenderer) {
  const perf = folder.addFolder('Performance');
  const gpu = new GpuTimer(renderer.getContext() as WebGL2RenderingContext);
  pipeline.profiler = gpu;
  const shown = { gpu: '', frame: '', calls: '', memory: '', passes: '' };
  const rows: [keyof typeof shown, string][] = [
    ['gpu', 'GPU ms'],
    ['frame', 'Frame ms (avg / worst)'],
    ['calls', 'Draw calls (scene / all)'],
    ['passes', 'Passes'],
    ['memory', 'Render targets'],
  ];
  for (const [key, label] of rows) perf.add(shown, key).name(label).disable().listen();

  const frames: number[] = [];
  let last = performance.now();
  const tick = (now: number) => {
    frames.push(now - last);
    last = now;
    if (frames.length > 120) frames.shift();
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    shown.frame = `${avg.toFixed(1)} / ${Math.max(...frames).toFixed(1)}`;
    shown.gpu = gpu.available
      ? `${gpu.totalMs.toFixed(2)} (${gpu.results().map(([stage, ms]) => `${stage} ${ms.toFixed(2)}`).join(', ')})`
      : 'not measurable in this browser';
    const stats = pipeline.stats();
    shown.calls = `${stats.sceneCalls} / ${renderer.info.render.calls}`;
    shown.passes = `${stats.passes}, ${stats.format}`;
    shown.memory = `${(stats.bytes / 2 ** 20).toFixed(1)} MB`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function loadPresets(): Record<string, RenderSettings> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function storePresets(presets: Record<string, RenderSettings>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Private windows can refuse storage; the preset then lasts until reload.
  }
}

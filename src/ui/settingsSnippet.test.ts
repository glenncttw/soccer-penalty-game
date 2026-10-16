import { describe, expect, it } from 'vitest';
import { settingsSnippet } from './settingsSnippet';

describe('settingsSnippet', () => {
  it('writes settings as a TypeScript object to paste into a settings file', () => {
    const text = settingsSnippet('GRASS_SETTINGS', 'GrassSettings', {
      colorLight: '#619033',
      crossStripeOpacity: 0.1 + 0.2,
      clouds: true,
      lightDirection: [0.5, 1, -0.25],
    });
    expect(text).toBe(
      'export const GRASS_SETTINGS: GrassSettings = {\n' +
        "  colorLight: '#619033',\n" +
        '  crossStripeOpacity: 0.3,\n' +
        '  clouds: true,\n' +
        '  lightDirection: [0.5, 1, -0.25],\n' +
        '};\n',
    );
  });
});

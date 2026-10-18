/**
 * Writes settings as TypeScript, ready to paste over the settings object in its
 * file (for example `GRASS_SETTINGS` in src/scene/grassSettings.ts).
 */
export function settingsSnippet(name: string, type: string, settings: object): string {
  const lines = Object.entries(settings).map(([key, value]) => `  ${key}: ${formatValue(value)},`);
  return `export const ${name}: ${type} = {\n${lines.join('\n')}\n};\n`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`;
  // Sliders leave tiny rounding errors (0.30000000000000004); 4 decimals is plenty.
  if (typeof value === 'number') return String(Number(value.toFixed(4)));
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.entries(value).map(([key, v]) => `${key}: ${formatValue(v)}`);
    return `{ ${fields.join(', ')} }`;
  }
  return String(value);
}

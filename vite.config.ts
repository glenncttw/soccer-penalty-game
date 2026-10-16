import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /<repo-name>/.
  base: '/soccer-penalty-game/',
  server: { open: '/soccer-penalty-game/' },
  // Rapier ships its WASM inlined, so the main chunk is expected to be large.
  build: { chunkSizeWarningLimit: 6000 },
});

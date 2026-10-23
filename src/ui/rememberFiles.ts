/**
 * Remembers the game's files on this device (public/sw.js), so a later visit doesn't download them again. Only in
 * the built game: while developing, every change should load fresh.
 */
const ON = import.meta.env.PROD && 'serviceWorker' in navigator;

/** Starts remembering: call as the page opens, so the files loaded after that are remembered straight away. */
export function rememberFiles() {
  if (ON) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

/** The game is in: tells the worker which files it loaded, so it remembers those and forgets older ones. */
export async function gameFilesIn() {
  if (!ON) return;
  const worker = await Promise.race([
    navigator.serviceWorker.ready.then((r) => r.active),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  worker?.postMessage({
    type: 'game-in',
    page: location.href,
    files: performance.getEntriesByType('resource').map((e) => e.name),
  });
}

/*
 * Remembers the game's files on this device (a service worker, registered by src/ui/rememberFiles.ts), so a later
 * visit doesn't download them again: the stadium, the baked light, the keeper, the physics engine and the rest.
 *
 * - The page itself (index.html) always comes from the internet when there is a connection, so a new version of the
 *   game is found straight away. Without a connection the remembered one opens.
 * - Files with a fingerprint in their name (Vite's assets/name-AbC123xy.js) never change: remembered for good.
 * - Other files (the Blender files in public/assets) keep their name when they change. So when the page is a new
 *   version, its files are checked with the server once (a quick "still the same?" that downloads nothing when
 *   they are) and remembered again; when the page is the same as last time, the remembered files are used as they are.
 * - Once the game is in, the page says so and files the game no longer uses are forgotten.
 *
 * To switch it off for everyone: replace this file with one that only does
 * `self.registration.unregister()` in its activate event, and deploy.
 */
const CACHE = 'game-files-v1';
const PAGE_KEY = 'remembered-page'; // the last index.html, to tell a new version of the game

const FINGERPRINT = /-[\w-]{8}\.\w+$/;
/** Pages (by client id) that are the same as last time: their files come straight from the device. Any other
 * page's files are checked with the server. */
const sameVersion = new Set();
/** The files each page asked for, so the rest can be forgotten once it's in. */
const used = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (request.mode === 'navigate') event.respondWith(page(event));
  else if (request.headers.has('range')) return;
  else event.respondWith(file(event, url));
});

/** The page: from the internet, noting whether it's a new version; the remembered one without a connection. */
async function page(event) {
  const cache = await caches.open(CACHE);
  const client = event.resultingClientId;
  try {
    const response = await fetch(event.request);
    if (!response.ok) return response;
    const text = await response.clone().text();
    const last = await cache.match(PAGE_KEY);
    const same = last !== undefined && (await last.text()) === text;
    if (same) sameVersion.add(client);
    used.set(client, new Set());
    await cache.put(PAGE_KEY, response.clone());
    return response;
  } catch (error) {
    const last = await cache.match(PAGE_KEY);
    if (!last) throw error;
    sameVersion.add(client);
    return last;
  }
}

async function file(event, url) {
  const cache = await caches.open(CACHE);
  const key = url.href;
  used.get(event.clientId)?.add(key);
  const fingerprinted = FINGERPRINT.test(url.pathname);
  // A page this worker doesn't know (it was restarted, or it's the crowd's helper) is checked to be safe.
  const trust = fingerprinted || sameVersion.has(event.clientId);
  if (trust) {
    const remembered = await cache.match(key);
    if (remembered) return remembered;
  }
  // Checked with the server: `no-cache` asks "still the same?", which downloads nothing when it is.
  const response = await fetch(event.request, fingerprinted ? undefined : { cache: 'no-cache' });
  if (response.ok && response.type === 'basic') await cache.put(key, response.clone());
  return response;
}

/**
 * The game is in: the page sends the files it loaded. Any not remembered yet (on the first visit the page loads
 * before this worker starts) are remembered now, mostly straight from the browser's own short-term memory, and
 * after a new version the files the game no longer uses (an older version's) are forgotten.
 */
self.addEventListener('message', (event) => {
  const { data } = event;
  if (data?.type !== 'game-in') return;
  const client = event.source?.id;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const scope = self.registration.scope;
      const files = new Set(data.files.filter((f) => f.startsWith(scope)));
      for (const f of used.get(client) ?? []) files.add(f);
      for (const f of files) {
        if (await cache.match(f)) continue;
        try {
          const response = await fetch(f);
          if (response.ok && response.type === 'basic') await cache.put(f, response);
        } catch {
          // offline: next time
        }
      }
      if (!(await cache.match(PAGE_KEY))) {
        const response = await fetch(data.page).catch(() => null);
        if (response?.ok) await cache.put(PAGE_KEY, response);
      }
      if (sameVersion.has(client)) return;
      for (const request of await cache.keys()) {
        if (request.url.endsWith(PAGE_KEY)) continue;
        if (!files.has(request.url)) await cache.delete(request);
      }
    })(),
  );
});

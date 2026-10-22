// The one bit of Node the tests use to read the keeper model from public/ (the game itself runs in the browser).
declare module 'node:fs' {
  export function readFileSync(path: URL): Uint8Array<ArrayBuffer>;
}

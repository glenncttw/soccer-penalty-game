// Changes Blender's stadium export for the game; run it on every new export:
//
//   node tools/edit-stadium.mjs Stadium_Recon_web.glb public/assets/stadium/Stadium_Recon_web.glb
//
// 1. The narrow ad boards along the sides (ADV_Panel_E07-E10 and W07-W10, 1.00 m each) become two boards of
//    2.00 x 0.72 m per side, filling the same 4 m stretch (as in Blender v015). They're copies of the
//    board next to them (06), at that width, so they keep its baked light; they keep the colours of 07 and 08.
// 2. The faces of the stands and trees that face away from everywhere a camera can be (anywhere over the pitch,
//    up to CAMERA_BOX's height) are taken out: the backs of the stands and trees, which nobody sees. The game
//    draws only the front of these faces, so the picture stays the same; the inside of the stadium is left alone.
//
// Running it on a file it already changed changes nothing more.
import process from 'node:process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

/** Everywhere a camera can be: over the pitch (and a bit past it), up to this high, in the model's own metres. */
const CAMERA_BOX = { min: [-7, 0, -27.5], max: [7, 6, -2] };
/** The meshes whose backs are taken out: outside the stadium's inside. */
const BACKS_OF = ['STATIC_Concrete', 'STATIC_Trees'];
/** The narrow boards' numbers, the board they're copied from, and the new boards' width (m). */
const NARROW = ['07', '08', '09', '10'];
const NEXT_TO = '06';
const BOARD_WIDTH = 2;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node tools/edit-stadium.mjs <in.glb> <out.glb>');
  process.exit(1);
}
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
const node = (name) => root.listNodes().find((n) => n.getName() === name);
const triangles = () =>
  root
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0);
const before = triangles();

// 1. Wider boards.
for (const side of ['E', 'W']) {
  const narrow = NARROW.map((k) => node(`ADV_Panel_${side}${k}`));
  if (narrow.some((n) => !n)) {
    console.log(`Boards ${side}: already widened (or not in this export)`);
    continue;
  }
  const source = node(`ADV_Panel_${side}${NEXT_TO}`);
  const sourceWidth = width(source.getMesh());
  // Along the row from the first narrow board to the last, starting where the first one started.
  const first = narrow[0].getTranslation();
  const last = narrow[narrow.length - 1].getTranslation();
  const along = normalize(sub(last, first));
  const start = add(first, scale(along, -width(narrow[0].getMesh()) / 2));
  const count = Math.floor((distance(first, last) + width(narrow[0].getMesh())) / BOARD_WIDTH);
  for (let i = 0; i < NARROW.length; i++) {
    const old = narrow[i];
    if (i >= count) {
      const mesh = old.getMesh();
      old.dispose();
      if (mesh.listParents().length <= 1) mesh.dispose();
      continue;
    }
    // A copy of the board next to them, made BOARD_WIDTH wide, in this board's own colour.
    const material = old.getMesh().listPrimitives()[0].getMaterial();
    const mesh = old.getMesh();
    for (const p of mesh.listPrimitives()) p.dispose();
    for (const p of source.getMesh().listPrimitives()) {
      const copy = p.clone();
      const position = p.getAttribute('POSITION').clone();
      const v = [0, 0, 0];
      for (let k = 0; k < position.getCount(); k++) {
        position.getElement(k, v);
        position.setElement(k, [(v[0] * BOARD_WIDTH) / sourceWidth, v[1], v[2]]);
      }
      copy.setAttribute('POSITION', position).setMaterial(material);
      mesh.addPrimitive(copy);
    }
    old.setTranslation(add(start, scale(along, BOARD_WIDTH * (i + 0.5))));
    console.log(
      `Board ${old.getName()}: ${BOARD_WIDTH} m wide (from ${source.getName()}, ${sourceWidth.toFixed(2)} m)`,
    );
  }
}

// 2. No backs.
const corners = [];
for (const x of [0, 1])
  for (const y of [0, 1])
    for (const z of [0, 1]) {
      corners.push([
        x ? CAMERA_BOX.max[0] : CAMERA_BOX.min[0],
        y ? CAMERA_BOX.max[1] : CAMERA_BOX.min[1],
        z ? CAMERA_BOX.max[2] : CAMERA_BOX.min[2],
      ]);
    }
for (const name of BACKS_OF) {
  const n = node(name);
  if (!n) throw new Error(`No ${name} in ${input}`);
  const world = n.getWorldMatrix();
  for (const p of n.getMesh().listPrimitives()) {
    const position = p.getAttribute('POSITION');
    const indices = p.getIndices();
    const at = (k) => transform(world, position.getElement(indices.getScalar(k), [0, 0, 0]));
    const kept = [];
    for (let t = 0; t < indices.getCount(); t += 3) {
      const a = at(t);
      const normal = cross(sub(at(t + 1), a), sub(at(t + 2), a));
      // Seen from its front by a camera somewhere in the box: facing one of its corners (the box is convex).
      if (corners.some((c) => dot(normal, sub(c, a)) > 0)) kept.push(t);
    }
    if (kept.length === indices.getCount() / 3) continue;
    const array = new (indices.getArray().constructor)(kept.length * 3);
    kept.forEach((t, i) =>
      array.set(
        [0, 1, 2].map((j) => indices.getScalar(t + j)),
        i * 3,
      ),
    );
    p.setIndices(doc.createAccessor().setType('SCALAR').setArray(array).setBuffer(indices.getBuffer()));
    compactPrimitive(p);
    console.log(`${name} (${p.getMaterial()?.getName()}): ${indices.getCount() / 3} -> ${kept.length} triangles`);
  }
}

// Keeping every UV set: the baked light is read from the second one, which no texture in the file points to.
await doc.transform(prune({ keepAttributes: true, keepExtras: true }));
await io.write(output, doc);
console.log(`Triangles: ${before} -> ${triangles()}`);

function width(mesh) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of mesh.listPrimitives()) {
    min = Math.min(min, p.getAttribute('POSITION').getMin([])[0]);
    max = Math.max(max, p.getAttribute('POSITION').getMax([])[0]);
  }
  return max - min;
}
function transform(m, v) {
  return [0, 1, 2].map((i) => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i]);
}
function add(a, b) {
  return a.map((v, i) => v + b[i]);
}
function sub(a, b) {
  return a.map((v, i) => v - b[i]);
}
function scale(a, s) {
  return a.map((v) => v * s);
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function distance(a, b) {
  return Math.hypot(...sub(a, b));
}
function normalize(a) {
  return scale(a, 1 / Math.hypot(...a));
}

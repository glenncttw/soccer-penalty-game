// Changes Blender's stadium export for the game; run it on every new export:
//
//   node tools/edit-stadium.mjs Stadium_Recon_web.glb public/assets/stadium/Stadium_Recon_web.glb
//
// The faces of the stands and trees that face away from everywhere a camera can be (anywhere over the pitch, up to
// CAMERA_BOX's height) are taken out: the backs of the stands and trees, which nobody sees. The game draws only the
// front of these faces, so the picture stays the same; the inside of the stadium is left alone. (Blender's export
// already leaves out most of the stands' backs, but not the trees'.)
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

function transform(m, v) {
  return [0, 1, 2].map((i) => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i]);
}
function sub(a, b) {
  return a.map((v, i) => v - b[i]);
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

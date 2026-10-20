# Modular crowd character: export v008 (2026-10-20)

Source: `Modular_v008.blend` (shapes approved as v007; v008 = the v007 shapes with 12 never-visible tris removed from the ponytail).
Re-export: `blender -b Modular_v008.blend -P scripts/export_modular.py -- out`

## Files
| File | Contents | Tris |
|---|---|---|
| `crowd_base.glb` | `CrowdCharacter` > `Body`, `Arm.L`, `Arm.R`, `Head` (4 morph targets) > `Scalp`. This is the approved master `Crowd_v008_light` without its hair, plus the shared Scalp that closes the head under every hairstyle. | 926 |
| `hp_hair_short.glb` | `HP_Hair_Short`: the master's original short hair | 104 |
| `hp_cap.glb` | `HP_Cap`: baseball cap (crown and visor in one welded mesh) | 306 |
| `hp_ponytail.glb` | `HP_Ponytail`: hair cap, swept tail, tie | 320 |
| `hp_buckethat.glb` | `HP_BucketHat`: bucket hat with the short hair under it, one mesh | 317 |
| `hp_hair_long.glb` | `HP_Hair_Long`: long hair | 330 |
| `crowd_manifest.json` | machine-readable version of this page (convention, slot table, file stats) | |

**All files:**
- One shared material, `M_Crowd_Atlas`: a 256x256 WebP atlas, metal 0, roughness 0.6.
- Compression: `EXT_meshopt_compression` and `EXT_texture_webp`, the same as the light master. Use `GLTFLoader` with `MeshoptDecoder`.
- Mesh attributes: `POSITION`, `NORMAL`, `TEXCOORD_0`, `_REGION`.

## The 5 characters
Each character = `crowd_base.glb` + one head piece, coloured with the slot colours below. The colours were measured
from each original model's texture (lit faces only; the originals have baked shading). They are also in
`crowd_manifest.json` under `characters`. Slots not listed keep the atlas default. FIXED (eyes and mouth) is never recoloured.

| Character | Head piece | SKIN | HAIR | SHIRT | SHORTS | SHOE | SOLE_SOCK | HAT | ACCENT |
|---|---|---|---|---|---|---|---|---|---|
| short_hair | `hp_hair_short.glb` | #f8a767 | #6f2e12 | #1223ec | #1123eb | #1325ec | #eeefee | – | – |
| cap | `hp_cap.glb` | #fcbf85 | #5c322b | #104cf5 | #083ad6 | #114ff7 | #f0efea | #195afc | – |
| ponytail | `hp_ponytail.glb` | #feca92 | #985435 | #164ef0 | #0e41dc | #1756f6 | #f4f8f3 | – | #6d3c26 |
| bucket_hat | `hp_buckethat.glb` | #fbac6b | #8a2e0e | #0b23ed | #0a23eb | #0923ec | #f4f4f1 | #0a24ed | – |
| long_hair | `hp_hair_long.glb` | #fdc58d | #925235 | #134ff6 | #0f44e5 | #1157fb | #f4f5f3 | – | – |

Comparison with the originals: `preview_five_vs_originals.png`. Line-up: `preview_five_lineup.png`.

## Attachment convention (one rule for every piece)
- Units are metres, +Y is up, and the character faces +Z. The origin is at the feet.
- Every head piece is **one node with an identity transform**, and its mesh is authored in **Head-local space** (origin = the neck pivot). So:
  `pieceWorldMatrix = characterWorldMatrix × headLocalMatrix`
  `headLocalMatrix` is the Head node's local matrix: translation (0, 0.545, 0.02), times any head rotation from animation.
- There are no per-piece offsets. Pieces follow head rotation automatically. A test of 25° yaw and 12° nod is in (see the Blender MCP project renders).
- Arm pivots (local to `CrowdCharacter`): `Arm.L` (0.135, 0.478, −0.012) and `Arm.R` (−0.135, 0.478, −0.012).
- **Verified end to end:** base + each piece GLB attached under `Head` with identity renders the same as the authoring file. The short hair is pixel-exact; the other four differ only in under 0.1% of pixels (edge anti-aliasing).

## Instancing layout (suggested)
- **Shared meshes:** `InstancedMesh` for Body, Arm.L, Arm.R, Head and Scalp, plus one `InstancedMesh` per head-piece type, each sized to the number of characters wearing it.
- **Per character, per frame:**
  - `root` = the character matrix
  - `head` = root × headLocal(t)
  - each arm = root × armLocal(t)
  - The piece instance matrix = `head`, the same matrix as the Head and Scalp instances. Because all of them derive from the same per-character data, they cannot drift apart.
- **Per-instance timing:** a phase/offset per character fed into the same animation functions.
- **Expressions:** `InstancedMesh.setMorphAt` on the Head mesh (`Surprised_O`, `Frown`, `Smile_Closed`, `Cheer_Open`).

## Colour slots (one material for everything)
`_REGION` holds an integer slot per vertex:

| Slot | Name | Default (sRGB) | Used by |
|---|---|---|---|
| 0 | FIXED | atlas | eyes, mouth, tongue: never tinted |
| 1 | SKIN | #f6a464 | face, ears, neck, arms, Scalp |
| 2 | SHIRT | #1123eb | shirt, sleeves |
| 3 | SHORTS | #1123eb | shorts |
| 4 | SHOE | #1123eb | shoe uppers |
| 5 | SOLE_SOCK | #ebebeb | soles, white collars |
| 6 | HAIR | #672a0f | all hair |
| 7 | HAT | #1123eb | cap, bucket hat |
| 8 | ACCENT | #1123eb | ponytail tie |

**Shading:** `colour = atlas(uv).rgb * slotColour[region] / slotDefault[region]`, computed in linear space, with slot 0 left unchanged.
- The atlas swatch already equals the slot default, so a tinted swatch becomes exactly `slotColour`, and the eye decal stays intact.
- Per-instance slot colours can live in a small DataTexture (9 × N texels), read by instance id. No extra materials are needed.
- `preview_five_vs_originals.png` shows the 5 characters coloured only this way, built from these files.

## Animation notes
- Head pieces are rigid with the head. For long hair, keep head yaw within about ±20° so the locks don't swing through the shoulders.
- Raising the arms above about 110° brings the hands near the hat brims, the same as on the bare head.
- The base geometry is the light master, bit-exact except 3 hidden neck-ring vertices. Meshopt position quantisation moved those by 0.35 mm.

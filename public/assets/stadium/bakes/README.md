# Bakes: Three.js setup (v010, delivered)

Source scene: `Stadium_Recon_v010_trees_flags_boards.blend`, matching GLB: `Stadium_Recon_web.glb` (exported from v010).
All bakes use the **second UV set** (`Lightmap` → glTF `TEXCOORD_1` → three.js `texture.channel = 1`), with `flipY = false`.
`stadium_lighting.js` does all of the setup below. Call `setupStadiumLighting(renderer, gltf.scene, { bakes: "bakes/" })`.

## Files to ship

| File | Encoding | Size | Colour space | Used by |
|---|---|---|---|---|
| T_Stands_Combined.ktx2 | ETC1S, 2048², mips | 548 KB | sRGB | A: STATIC_Concrete, STATIC_Railings, FLOOD_Light_L/R structure |
| T_Stands_Combined_hq.ktx2 | UASTC + Zstd (optional, `standsHQ: true`) | 2.3 MB | sRGB | same, near-lossless (crisper rails) |
| T_Trees_Combined.ktx2 | UASTC + Zstd, 1024², mips | 590 KB | sRGB | A: STATIC_Trees |
| T_Ground_Combined.ktx2 | UASTC + Zstd, 512², mips | 49 KB | sRGB | A: GROUND_Outside |
| T_Props_Lightmap.ktx2 | ETC1S, 1024², mips | 136 KB | sRGB, stores light ÷ 2 | B: ADV_Panel_* (21), GOAL_Frame |
| T_Props_AO.ktx2 | ETC1S R8, 1024², mips | 135 KB | linear | B: ADV_Panel_*, GOAL_Frame |
| T_Grass_Lightmap.ktx2 | ETC1S, 1024², mips | 40 KB | sRGB, light ÷ 2 | B: PITCH_Grass (game grass shader) |
| T_Grass_AO.ktx2 | ETC1S R8, 1024², mips | 44 KB | linear | PITCH_Grass |
| ENV_BallSpot_equirect.exr | half float, 1024×512 | 614 KB | linear | C: ball, keeper, crowd, net, flags (PMREM) |
| `*.webp` | WebP q90–92 fallback (no KTX2 support) | 1.0 MB total | as above | `format: "webp"` |

PNG masters (`T_*.png`) and float lightmap masters (`T_*_Lightmap.exr`) stay in this folder for re-encoding (`encode_ktx2.sh`). They don't need to ship.

**Download** (GLB 1.80 MB + default KTX2 1.51 MB + panorama 0.60 MB): **≈ 3.9 MB**. With the HQ stands: ≈ 5.7 MB.
**Graphics memory** (desktop transcodes to BC7; mobile to ASTC/ETC): ≈ 10 MB for the textures plus ≈ 3 MB for the panorama's PMREM, against ≈ 52 MB as raw RGBA.
Quality vs the masters: UASTC atlases 42–52 dB, lightmaps/AO 38–47 dB, ETC1S stands 31 dB. On screen the ETC1S stands differ from UASTC by 1.6 levels on average; 1.9% of stand pixels differ by more than 8 levels, along the rails.

## Groups and setup

| Object (GLB node) | Group | Material in three.js | Shadows |
|---|---|---|---|
| STATIC_Concrete | A | `MeshBasicMaterial({ map: T_Stands_Combined })` | casts (shades the pitch and boards), receives none |
| STATIC_Railings, FLOOD_Light_L/R structure, STATIC_Trees, GROUND_Outside | A | `MeshBasicMaterial({ map })` with their atlas | none |
| FLOOD_Light lamp primitives (`M_Floodlight_Emissive`, `M_Floodlight_Glow`) | D | as exported (emissive strength) | none |
| ADV_Panel_* (21), GOAL_Frame | B | exported MeshStandardMaterial + `lightMap` (`lightMapIntensity = 2π`) + `aoMap` (`aoMapIntensity = 0.5`), `envMap = null` | receive; GOAL_Frame casts |
| PITCH_Grass | B | game grass shader: `indirect = baseColour × lightmap × 2 × mix(1, ao, 0.5)` + realtime sun with shadows | receives |
| Football_Ball, CORNER_Flag_L/R, keeper, crowd | C | PBR + sun + `envMap` = PMREM(panorama), intensity 1.0 | cast + receive |
| GOAL_Net | C | PBR, double-sided, `envMapIntensity = 0.6` | none |
| STATIC_Markings | - | hidden (painted by the grass shader) | - |

- **No HemisphereLight.** The lightmaps (B) and the panorama (C) replace the ambient fill. Group A ignores lights.
- **Sun** (`SUN_Key` in the GLB): colour `#FFFBAA`, intensity 3.7, shining along three.js (-0.8192, -0.5736, 0), i.e. from the right side of the pitch at 35° elevation. 2048 shadow map, `bias -0.0004`, `normalBias 0.03`, shadow camera ±16 m centred on (0, 0, -16).
- Renderer: `outputColorSpace = SRGBColorSpace`, `toneMapping = NoToneMapping`.
- Why `lightMapIntensity = 2π`: the textures store light ÷ 2, and three.js divides indirect light by π.

## Re-making the bakes

1. `blender -b Stadium_Recon_v010_trees_flags_boards.blend --python bake_headless.py -- Ground Grass Props Trees Stands`
2. `blender -b Stadium_Recon_v010_trees_flags_boards.blend --python bake_preview.py -- --pano` (separately: `-- --beauty --preview`)
3. `cd bakes && bash ../encode_ktx2.sh`, then `blender -b --factory-startup --python bakes_to_webp.py` for the WebP fallback.

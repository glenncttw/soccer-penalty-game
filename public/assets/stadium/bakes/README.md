# Bakes: Three.js setup (v012)

Source scene: `Stadium_Recon_v012_clean_bakes.blend`, matching GLB: `Stadium_Recon_web.glb` (exported from it).
All texture bakes use the **second UV set** (`Lightmap` → glTF `TEXCOORD_1` → three.js `texture.channel = 1`), with `flipY = false`.
Trees and railings have no lightmap UVs: their baked light is the vertex colour (`COLOR_0`).
`stadium_lighting.js` does all of the setup below. Call `setupStadiumLighting(renderer, gltf.scene, { bakes: "bakes/" })`.

## Files to ship

| File | Encoding | Size | Colour space | Used by |
|---|---|---|---|---|
| T_Stands_Combined.ktx2 | ETC1S, 2048², mips | 402 KB | sRGB | A: STATIC_Concrete, FLOOD_Light_L/R structure |
| T_Stands_Combined_hq.ktx2 | UASTC + Zstd (optional, `standsHQ: true`) | 1.9 MB | sRGB | same, near-lossless |
| T_Ground_Combined.ktx2 | UASTC + Zstd, 512², mips | 53 KB | sRGB | A: GROUND_Outside |
| T_Props_Lightmap.ktx2 | ETC1S, 1024², mips | 140 KB | sRGB, stores light ÷ 2 | B: ADV_Panel_* (21), GOAL_Frame |
| T_Props_AO.ktx2 | ETC1S R8, 1024², mips | 144 KB | linear | B: ADV_Panel_*, GOAL_Frame |
| T_Grass_Lightmap.ktx2 | ETC1S, 1024², mips | 41 KB | sRGB, light ÷ 2 | B: PITCH_Grass (game grass shader) |
| T_Grass_AO.ktx2 | ETC1S R8, 1024², mips | 45 KB | linear | PITCH_Grass |
| ENV_BallSpot_equirect.exr | half float, 1024×512 | 550 KB | linear | C: ball, keeper, crowd, net, flags (PMREM) |
| `*.webp` | WebP q90–92 fallback (no KTX2 support) | 0.43 MB total | as above | `format: "webp"` |

No tree texture any more (v011: `T_Trees_Combined`, 590 KB).

## Groups and setup

| Object (GLB node) | Group | Material in three.js | Shadows |
|---|---|---|---|
| STATIC_Concrete | A | `MeshBasicMaterial({ map: T_Stands_Combined })` | casts (shades the pitch and boards), receives none |
| FLOOD_Light_L/R structure, GROUND_Outside | A | `MeshBasicMaterial({ map })` with their atlas | none |
| STATIC_Trees, STATIC_Railings | V | one `MeshBasicMaterial({ vertexColors: true })` | none |
| FLOOD_Light lamp primitives (`M_Floodlight_Emissive`, `M_Floodlight_Glow`) | D | as exported (emissive strength) | none |
| ADV_Panel_* (21), GOAL_Frame | B | exported MeshStandardMaterial + `lightMap` (`lightMapIntensity = 2π`) + `aoMap` (`aoMapIntensity = 0.5`), `envMap = null` | receive; GOAL_Frame casts |
| PITCH_Grass | B | game grass material + `lightMap` / `aoMap` as above, realtime sun with shadows | receives |
| Football_Ball, CORNER_Flag_L/R, keeper, crowd | C | PBR + sun + `envMap` = PMREM(panorama), intensity 1.0 | cast + receive |
| GOAL_Net | C | PBR, double-sided, `envMapIntensity = 0.6` | none |
| STATIC_Markings | - | hidden (painted by the grass shader) | - |

- **No HemisphereLight.** The lightmaps (B) and the panorama (C) replace the ambient fill. Groups A and V ignore lights.
- **Sun** (`SUN_Key` in the GLB): colour `#FFFBAA`, intensity 3.7, shining along three.js (-0.8192, -0.5736, 0). 2048 shadow map, `bias -0.0004`, `normalBias 0.03`, shadow camera ±16 m centred on (0, 0, -16) in the stadium's own coordinates.
- Renderer: `outputColorSpace = SRGBColorSpace`, `toneMapping = NoToneMapping`.
- Why `lightMapIntensity = 2π`: the textures store light ÷ 2, and three.js divides indirect light by π.

## How v012 was baked (differences from v011)

- Bounce light from `M_Grass_*`, `M_Ground_Outside`, `M_Tree_Foliage_*` and `M_Floodlight_Structure` keeps 25% of its saturation (Light Path → Is Diffuse Ray). Camera rays and the baked surfaces themselves keep their full colour. The exported materials are unchanged.
- `M_Floodlight_Glow` emits for camera rays only during the bakes. In the GLB its emission is unchanged.
- Bake sun disc 6° (v011: 2.5°). Direction, colour and strength unchanged.
- Trees and rails: Combined bake to vertex colours. On the rails, posts take the colour of the rail they hold (both post ends are buried), and no rail piece drops below 70% of its bright side.
- Stands atlas: rails removed, floodlight housings ×2 texel area, 6 px gaps between islands, 16 px edge extension; lamp faces collapsed to one texel.
- Panorama: desaturated to 25%, keeping luminance.

## Re-making the bakes

See the main README ("Rebuilding"). Settings: `v012_common.py`.

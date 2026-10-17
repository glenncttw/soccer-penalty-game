# Bakes: Three.js setup (v013)

Source scene: `Stadium_Recon_v013_clean_bakes.blend`, matching GLB: `Stadium_Recon_web.glb` (exported from it).
All texture bakes use the **second UV set** (`Lightmap` → glTF `TEXCOORD_1` → three.js `texture.channel = 1`), with `flipY = false`.
The trees have no lightmap UVs: their baked light is the vertex colour (`COLOR_0`).
`stadium_lighting.js` does all of the setup below. Call `setupStadiumLighting(renderer, gltf.scene, { bakes: "bakes/" })`.

## Files to ship

| File | Encoding | Size | Colour space | Used by |
|---|---|---|---|---|
| T_Stands_Combined.ktx2 | ETC1S, 2048², mips | 380 KB | sRGB | A: STATIC_Concrete, FLOOD_Light_L/R structure |
| T_Stands_Combined_hq.ktx2 | UASTC + Zstd (optional, `standsHQ: true`) | 1.7 MB | sRGB | same, near-lossless |
| T_Rails_Combined.ktx2 | ETC1S, 2048², mips | 524 KB | sRGB | A: STATIC_Railings |
| T_Ground_Combined.ktx2 | UASTC + Zstd, 512², mips | 49 KB | sRGB | A: GROUND_Outside |
| T_Props_Lightmap.ktx2 | ETC1S, 1024², mips | 132 KB | sRGB, stores light ÷ 2 | B: ADV_Panel_* (21), GOAL_Frame |
| T_Props_AO.ktx2 | ETC1S R8, 1024², mips | 136 KB | linear | B: ADV_Panel_*, GOAL_Frame |
| T_Grass_Lightmap.ktx2 | ETC1S, 1024², mips | 41 KB | sRGB, light ÷ 2 | B: PITCH_Grass (game grass shader) |
| T_Grass_AO.ktx2 | ETC1S R8, 1024², mips | 44 KB | linear | PITCH_Grass |
| ENV_BallSpot_equirect.exr | half float, 1024×512 | 549 KB | linear | C: ball, keeper, crowd, net, flags (PMREM) |
| `*.webp` | WebP q90–92 fallback (no KTX2 support) | 1.1 MB total | as above | `format: "webp"` |

No tree texture any more (v011: `T_Trees_Combined`, 590 KB).

## Groups and setup

| Object (GLB node) | Group | Material in three.js | Shadows |
|---|---|---|---|
| STATIC_Concrete | A | `MeshBasicMaterial({ map: T_Stands_Combined })` | casts (shades the pitch and boards), receives none |
| STATIC_Railings | A | `MeshBasicMaterial({ map: T_Rails_Combined })` | none |
| FLOOD_Light_L/R structure, GROUND_Outside | A | `MeshBasicMaterial({ map })` with their atlas | none |
| STATIC_Trees | V | `MeshBasicMaterial({ vertexColors: true })` | none |
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

## How v013 was baked (differences from v011)

- Bounce light from `M_Grass_*`, `M_Ground_Outside`, `M_Tree_Foliage_*` and `M_Floodlight_Structure` keeps 25% of its saturation (Light Path → Is Diffuse Ray). Camera rays and the baked surfaces themselves keep their full colour. The exported materials are unchanged.
- `M_Floodlight_Glow` emits for camera rays only during the bakes. In the GLB its emission is unchanged.
- Bake sun disc 6° (v011: 2.5°). Direction, colour and strength unchanged.
- Trees: baked with one canopy colour (average of the three foliage colours) to vertex colours, then blurred over 0.5 m (Gaussian) across all trees.
- Rails: own 2048 atlas (about 92 px/m on visible faces, v011: 47), 2048 samples. ETC1S: on screen it looked the same as UASTC (2.1 MB).
- Stands atlas: rails removed, floodlight housings ×2 texel area (about 70 px/m, v011: 47), lamp faces collapsed to one texel.
- Margins: gap between islands = bake edge extension (Stands 6 px, Rails / Props 4 px), as in v011.
- Panorama: desaturated to 25%, keeping luminance.

## Re-making the bakes

See the main README ("Rebuilding"). Settings: `v013_common.py`.

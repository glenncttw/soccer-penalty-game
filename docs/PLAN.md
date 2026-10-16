# Soccer Penalty Game: Plan

A fun, fast 3D penalty shootout that runs in the browser on desktop and mobile. Browser only: no native app builds.

## Design decisions

- **Camera**: the gameplay camera designed in Blender: first-person from behind the ball, ball low in the foreground, goal centred. On screens narrower than 16:9 the view widens just enough to keep the whole goal visible.
- **No visible shooter**: there is no third-person player model. The ball, its flight and its curl are the star.
- **Curl is visible**: the ball spins visibly and leaves a bright trail ribbon, so the bend of every shot reads clearly.
- **Stadium**: a stylized stadium modelled in Blender by Glenn (`public/assets/stadium/`), with stands, railings, ad boards, floodlights and trees. Only the sector the gameplay camera sees is modelled. Goal, ball and penalty spot sizes come from the model (goal opening 5.64 x 1.92 m, penalty 12.4 m, ball radius 0.175 m). A crowd can be added on the stands later.
- **Shooting feel**: inspired by Blob Cup's shooting (ideas only, nothing copied). See [blob-cup-study.md](blob-cup-study.md).
- **Art style**: fun and playful, inspired by the kodeclubs.com 3D world:
  - Low-poly, flat-shaded (faceted) geometry with chunky, simplified shapes. No outlines, no realistic textures.
  - Bright sunny daylight with soft, slightly blue-tinted shadows and gentle ambient light.
  - Palette: saturated grass green (`#5DCB5E`, darker stripe `#56C357`), mint and teal foliage (`#89CCBC`, `#77C5A3`), cream paths and lines (`#F3E6C8`), clean white structures, soft sky blue, with purple (`#6C398B`) and hot pink accents for banners, ads and UI.
  - Characters (the keeper) are simple, cute, rounded figures in the same style.
  - Typography is not decided yet.

## Core gameplay

- **Shoot**: aim with the pointer at a spot in the goal, press and hold to charge a power meter that sweeps up and down (release in the gold zone for a perfect strike; too much power skies it, too little is soft), drag sideways while holding to curl, release to shoot. The ball is kicked so it bends into the aimed spot.
- **Save**: on the opponent's turn the camera moves to the goal line (still first-person, no visible keeper body, just gloves). You pick a dive direction before the ball arrives.
- **Shootout rules**: 5 kicks each, then sudden death. Score, kick history dots, winner screen.
- **AI keeper and AI shooter**: readable behaviour, with reaction time, reach and accuracy as their skill settings. The AI keeper is visible in goal when you shoot (stylized, playful character). For now there is one keeper strength and no level switch.
- **Juice**: slow-mo on goals, camera shake on kicks, post hits and saves, grass puffs and glitter on perfect strikes. Sound, a net that bulges and confetti were tried and taken out again.
- **Sky**: a blue gradient with puffy, stylised clouds that drift slowly behind the stadium, drawn by one shader (settings in `src/scene/skySettings.ts`).

## Out of scope for v1

Native mobile apps, online multiplayer, full matches, licensed teams or players, accounts and leaderboards. The visual crowd is a later milestone.

## Tech stack

| Area | Pick | Why |
|---|---|---|
| Rendering | **Three.js, WebGL 2 renderer** | Works on every current desktop and mobile browser; the mature post-processing ecosystem (outlines, bloom) targets it |
| Language | **TypeScript** | Catches mistakes early as gameplay code grows; no runtime cost |
| Build / dev server | **Vite** | Instant reloads, trivial static build |
| Physics | **Rapier** (`@dimforge/rapier3d-compat`) | Fast WASM physics for collisions: ball against posts, crossbar, net and keeper, plus props, rebounds and anything else that needs to collide |
| Ball flight | Custom Magnus (curl) force applied to the Rapier ball each step | Full control over how the curl feels, which a generic engine doesn't give |
| Audio | **None for now** | The placeholder sounds were taken out; recorded sounds can come later (Web Audio API or Howler.js) |
| UI / HUD | HTML/CSS overlay | Menus and scoreboard don't need to be in 3D |
| Assets | Low-poly glTF (CC0 packs from Kenney / Quaternius, or Blender) | Light, fits the playful style, loads natively in Three.js |
| Tests | **Vitest** | Unit tests for scoring, AI and shot math |
| Hosting | **GitHub Pages** via GitHub Actions | Free, deploys on every push to main |

### Why WebGL 2 and not WebGPU

Three.js's WebGPU renderer is production-ready and falls back to WebGL 2, but a stylized scene like this gains nothing visible from WebGPU, and WebGL 2 has the widest mobile support and the most battle-tested post-processing. If we ever need it (for example a huge animated crowd), switching to `WebGPURenderer` is a contained change.

### Why Rapier plus a custom curl force

Rapier handles every collision (posts, net, keeper, future props and objects) robustly, and it is fast and small enough for mobile. On top of it we apply our own drag and Magnus force each physics step, so the bend of the ball feels exactly how we want.

### Alternatives considered

- **React Three Fiber**: nice if the UI grows complex; an extra layer we don't need for a single-scene game.
- **Babylon.js**: strong all-in-one engine; heavier, fewer examples in this style.
- **Unity / Godot web export**: big downloads and slower iteration in the browser.

## Milestones

1. **Scaffold**: Vite + TS + Three.js, lint, Vitest, CI build, GitHub Pages deploy of an empty scene.
2. **Pitch, goal and stadium**: Glenn's Blender stadium loaded as the environment, with lighting matched to Blender and soft shadows.
3. **Shooting**: aim, hold-to-charge power meter, drag-to-curl input, Rapier ball physics with custom curl, visible spin and trail, goal / post / miss detection.
4. **Keeper AI**: stylized keeper that dives with limited timing and reach (done, with a placeholder look; see [blob-cup-study.md](blob-cup-study.md#our-keeper)).
5. **Saving turn**: first-person goal-line view, dive input, AI shooter.
6. **Shootout loop**: alternate turns, 5 kicks plus sudden death, HUD and result screen.
7. **Polish**: slow-mo, particles, camera feel and drifting clouds (done); menus, mobile touch tuning, performance pass.
8. **Crowd**: fill the stands with an instanced, animated crowd that reacts to goals and saves.

## Repo layout (planned)

```
src/
  main.ts          entry, renderer, loop
  feedback.ts      connects game moments (kick, touch, result) to camera, effects and HUD
  worldConfig.ts   gameplay coordinates measured from the stadium
  scene/           stadium loading and measuring, lighting, sky and clouds, camera, trail, aim markers, effects, keeper look
  physics/         Rapier world, ball, Magnus (curl) force
  gameplay/        aim, shot shaping, outcome, game events, slow motion, later the shootout
  ai/              keeper brain (reading the shot), keeper movement, later the shooter AI
  input/           swipe / mouse handling
  ui/              HUD, first-visit tips and menus (HTML/CSS)
public/assets/     stadium GLB, later recorded audio
docs/              this plan, the Blob Cup study
```

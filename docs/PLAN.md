# Soccer Penalty Game: Plan

A fun, fast 3D penalty shootout that runs in the browser on desktop and mobile. Browser only: no native app builds.

## Design decisions

- **Camera**: first-person, low behind the ball, with the goal dead center of the screen.
- **No visible shooter**: there is no third-person player model. The ball, its flight and its curl are the star.
- **Curl is visible**: the ball spins visibly and leaves a bright trail ribbon, so the bend of every shot reads clearly.
- **Stadium**: the pitch is enclosed by a stylized stadium (stands, roof edge, floodlights, ad boards). Stands are built so a crowd can be added later (instanced seats now, instanced crowd sprites or meshes later).
- **Art style**: fun and playful, inspired by kodeclubs.com. Bright saturated colors, chunky rounded shapes, toon (cel) shading with soft outlines, bouncy UI with a rounded bold font. Exact palette and font to be confirmed from the reference.

## Core gameplay

- **Shoot**: swipe or drag from the ball. Swipe direction sets the target, swipe speed sets power, and a curved swipe adds curl.
- **Save**: on the opponent's turn the camera moves to the goal line (still first-person, no visible keeper body, just gloves). You pick a dive direction before the ball arrives.
- **Shootout rules**: 5 kicks each, then sudden death. Score, kick history dots, winner screen.
- **AI keeper and AI shooter**: readable behaviour with easy / normal / hard levels that change reaction time, reach and accuracy. The AI keeper is visible in goal when you shoot (stylized, playful character).
- **Juice**: net ripple, crowd roar (audio first, visual crowd later), slow-mo on goals, camera shake on post hits, confetti on wins.

## Out of scope for v1

Native mobile apps, online multiplayer, full matches, licensed teams or players, accounts and leaderboards. The visual crowd is a later milestone.

## Tech stack

| Area | Pick | Why |
|---|---|---|
| Rendering | **Three.js, WebGL 2 renderer** | Works on every current desktop and mobile browser; the mature post-processing ecosystem (outlines, bloom) targets it |
| Language | **TypeScript** | Catches mistakes early as gameplay code grows; no runtime cost |
| Build / dev server | **Vite** | Instant reloads, trivial static build |
| Ball physics | **Small custom simulation** | Gravity, drag and Magnus (curl) force, plus sphere collisions against posts, crossbar, net and keeper hit boxes. Full control over how the curl feels, deterministic, tiny bundle |
| Audio | **Howler.js** | Simple cross-browser sound with mobile audio unlock handled |
| UI / HUD | HTML/CSS overlay | Menus and scoreboard don't need to be in 3D |
| Assets | Low-poly glTF (CC0 packs from Kenney / Quaternius, or Blender) | Light, fits the playful style, loads natively in Three.js |
| Tests | **Vitest** | Unit tests for scoring, AI and shot math |
| Hosting | **GitHub Pages** via GitHub Actions | Free, deploys on every push to main |

### Why WebGL 2 and not WebGPU

Three.js's WebGPU renderer is production-ready and falls back to WebGL 2, but a stylized scene like this gains nothing visible from WebGPU, and WebGL 2 has the widest mobile support and the most battle-tested post-processing. If we ever need it (for example a huge animated crowd), switching to `WebGPURenderer` is a contained change.

### Why no physics engine (Rapier) for now

A penalty kick is one ball against a handful of static shapes. A dedicated engine would cost bundle size and give us less control over the curl, which is the core feel of the game. If later features need many interacting bodies, Rapier is the drop-in choice.

### Alternatives considered

- **React Three Fiber**: nice if the UI grows complex; an extra layer we don't need for a single-scene game.
- **Babylon.js**: strong all-in-one engine; heavier, fewer examples in this style.
- **Unity / Godot web export**: big downloads and slower iteration in the browser.

## Milestones

1. **Scaffold**: Vite + TS + Three.js, lint, Vitest, CI build, GitHub Pages deploy of an empty scene.
2. **Pitch, goal and stadium**: centered goal with net, pitch markings, enclosed stylized stadium, lighting, toon shading and outline pass.
3. **Shooting**: swipe input, power and aim, custom ball physics with curl, visible spin and trail, goal / post / miss detection.
4. **Keeper AI**: stylized keeper that dives with difficulty-based timing and reach.
5. **Saving turn**: first-person goal-line view, dive input, AI shooter.
6. **Shootout loop**: alternate turns, 5 kicks plus sudden death, HUD and result screen.
7. **Polish**: sound, net ripple, slow-mo, particles, menus, mobile touch tuning, performance pass.
8. **Crowd**: fill the stands with an instanced, animated crowd that reacts to goals and saves.

## Repo layout (planned)

```
src/
  main.ts          entry, renderer, loop
  scene/           pitch, goal, stadium, lighting, camera
  physics/         ball simulation, collisions, Magnus force
  gameplay/        shootout state machine, scoring
  ai/              keeper and shooter AI
  input/           swipe / mouse handling
  ui/              HUD and menus (HTML/CSS)
public/assets/     models, textures, audio
docs/PLAN.md
```

# Soccer Penalty Game

A fun, playful 3D penalty shootout for the browser, built with Three.js, TypeScript, Vite and Rapier.

Swipe to shoot, bend it with curl, and dive to save in a 5-kick shootout against the AI.

See [docs/PLAN.md](docs/PLAN.md) for the gameplay scope, tech stack and milestones.

## How to play

1. **Aim**: move the mouse over the goal (on a phone, press where you want the ball to go).
2. **Power up**: press and hold. The meter on the right goes up and down. Let go in the **gold zone** for a perfect strike.
3. **Curl**: while holding, drag left or right to bend the ball that way. A dotted line shows the start of the curve.
4. **Shoot**: let go.

## The stadium

The whole environment (pitch, goal, stands, ball, gameplay camera and sun) is a Blender export:
`public/assets/stadium/Stadium_Recon_web.glb`. To update it, export a new GLB over that file.

The game reads all gameplay coordinates from the model when it loads (`src/scene/measureStadium.ts`),
so goal detection, collisions, the ball's start position and the camera follow the new export. It
relies on these node names:

| Node | Used for |
|---|---|
| `GOAL_Frame` | goal line position (its origin), posts and crossbar (measured from the geometry) |
| `GOAL_Net` (child of `GOAL_Frame`) | net shape for collisions |
| `Football_Ball` | the ball's look, start position and radius (origin must be the ball's centre) |
| `PITCH_Grass` | ground height |
| the first glTF camera | gameplay camera position, direction and field of view |
| the directional light | the sun |

Coordinates: Y up, metres, shots travel toward -Z. The game shifts the model along Z so its goal line sits at z = 0.
If a node is missing or a measurement looks wrong, the game stops with an error naming it.

## Getting started

Requires Node 22+.

```sh
npm install
npm run dev      # dev server at http://localhost:5173/soccer-penalty-game/
npm test         # unit tests (Vitest)
npm run lint     # ESLint
npm run build    # type-check and production build into dist/
```

Every push to `main` is built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.

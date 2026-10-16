# Soccer Penalty Game

A fun, playful 3D penalty shootout for the browser, built with Three.js, TypeScript, Vite and Rapier.

Swipe to shoot, bend it with curl, and dive to save in a 5-kick shootout against the AI.

See [docs/PLAN.md](docs/PLAN.md) for the gameplay scope, tech stack and milestones, and
[docs/blob-cup-study.md](docs/blob-cup-study.md) for what we learned from Blob Cup's shooting feel.

## How to play

1. **Aim**: move the mouse over the goal (on a phone, press where you want the ball to go). The target stays inside the goal frame.
2. **Power up**: press and hold. The meter on the right (below the goal on a phone held upright) goes up and down. Let go in the **gold zone** for a perfect strike.
3. **Curl**: while holding, drag left or right. The ball swings out to that side, then bends back onto your target. A dotted line shows the start of the curve.
4. **Shoot**: let go.

A goalkeeper tries to stop you. It watches which way the ball is heading, so a curled shot fools it, and soft
shots are easy saves. Its look is a placeholder made from simple shapes until there's a Blender model.

On your first visit, tips at the top walk you through your first shots. With a mouse, the view turns a little
toward where you point.

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
| `PITCH_Grass` | ground height, and where the stripes are: it needs two materials, and the darker one marks the dark stripes |
| `STATIC_Markings` | where the white lines and penalty spot are: the game paints the grass white there and hides this mesh |
| the first glTF camera | gameplay camera position, direction and field of view |
| the directional light | the sun |

Coordinates: Y up, metres, shots travel toward -Z. The game shifts the model along Z so its goal line sits at z = 0.
If a node is missing or a measurement looks wrong, the game stops with an error naming it.

## The sky

The sky and its clouds are drawn by one shader (`src/scene/sky.ts`), not a picture: a blue gradient with
puffy, cartoon clouds that drift slowly to the right, nearer ones a little faster than far ones. Each cloud is
made of 4 to 7 round puffs on a flat bottom, lit from the same side as the stadium's sun. The clouds are built
from a seed, so they look the same every time you load the game.

To change the look, edit `SKY_SETTINGS` in `src/scene/skySettings.ts`. Each setting has a short note. The
handiest ones:

| Setting | What it does |
|---|---|
| `clouds` | `false` turns the clouds off and keeps the blue gradient |
| `cloudCount`, `cloudCoverage` | how many clouds there are, and how much of the sky they fill (0 = clear sky) |
| `cloudScale`, `cloudWidthVariation`, `cloudHeightVariation` | how big they are, and how much they differ |
| `cloudSpeed` | drift speed in degrees per second (negative drifts left) |
| `cloudSeed` | any whole number gives a different set of clouds |
| `cloudColorTop`, `cloudColorBottom`, `skyColorTop`, `skyColorBottom` | the colours |
| `cloudSoftness`, `cloudShading`, `lightDirection`, `cloudLayerDepth` | edge softness, shading between puffs, where the light comes from, and how much smaller and hazier far clouds are |

## The grass

The pitch is drawn by one shader (`src/scene/grass.ts`) on top of the stripes from the Blender model:

- **Grass texture.** Two pictures that repeat over the pitch: a colour picture with curly blades and a normal map
  that gives them bumps the sun catches. They live in `public/assets/grass/` (`grass_albedo.webp` and
  `grass_normal.jpg`). Each area shows them shifted and mirrored differently, so you never see the same patch twice.
  Far away they blur smoothly (mipmaps) and the bumps fade out, so the grass doesn't flicker. The colour picture
  only adds variation around the stripe colours, so the stripes keep their colours.
- **Soft, ragged stripe edges and a checkerboard.** The edges wobble a little and blades poke across them. Bands
  across the pitch, counted from the goal line, swap light and dark, like a cross-mown pitch.
- **Painted lines and spot.** The white markings in the model are hidden; the shader paints the grass white in
  their place, with blades poking out of the edges.
- **Soft patches and viewing-angle shading.** Gentle lighter and darker patches, and grass you look down onto, in
  front of the ball, is darker and deeper green than grass you look across near the goal, as real grass is.

The pictures were baked in Blender from a small patch of curly 3D blades. To make new ones, follow [docs/grass-textures.md](docs/grass-textures.md).

To change the look, edit `GRASS_SETTINGS` in `src/scene/grassSettings.ts`. Each setting has a short note. The
handiest ones:

| Setting | What it does |
|---|---|
| `colorLight`, `colorDark` | the stripe colours |
| `textureStrength` | how much of the colour picture's variation shows (0 = plain stripe colours) |
| `normalStrength` | how strongly the bumps catch the light (0 = flat) |
| `textureTileSize`, `textureStretch` | how much pitch one copy of the pictures covers, and how much longer it is toward the goal so the blades look upright |
| `stripeSoftness`, `stripeRagged` | how soft and how ragged the stripe edges are |
| `checkerSize`, `checkerStrength` | how long the cross bands are toward the goal (0 = stripes only), and how strongly they swap light and dark (1 = full checkerboard) |
| `patchStrength`, `patchSize` | the soft lighter and darker patches |
| `angleShading` | how much darker the grass in front of you is (0 = the same everywhere) |
| `lineColor`, `lineRagged` | the colour of the painted lines and spot, and how far blades poke out of their edges |

To move or resize the stripes, lines or spot, change them in Blender and export again.

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

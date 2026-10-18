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

The whole environment (pitch, goal, stands, ball and sun) is a Blender export:
`public/assets/stadium/Stadium_Recon_web.glb`. Its light is baked in Blender too (see [The lighting](#the-lighting)),
so it comes as a package with three parts:

| File | What it is |
|---|---|
| `public/assets/stadium/Stadium_Recon_web.glb` | the stadium model |
| `public/assets/stadium/bakes/` | the baked light (KTX2 pictures, WebP copies as a fallback, and a panorama); its `README.md` lists every object |
| `src/scene/stadium_lighting.js` | puts the baked light on the model (kept exactly as the package delivers it; `stadium_lighting.d.ts` next to it describes it for TypeScript) |

To update the stadium, replace all three with the files from the new package. The bakes only fit the model they
were baked with.

The game reads all gameplay coordinates from the model when it loads (`src/scene/measureStadium.ts`),
so goal detection, collisions, the ball's start position and the camera (which stands behind the ball) follow
the new export. It relies on these node names:

| Node | Used for |
|---|---|
| `GOAL_Frame` | goal line position (its origin), posts and crossbar (measured from the geometry) |
| `GOAL_Net` (child of `GOAL_Frame`) | net shape for collisions |
| `Football_Ball` | the ball's look, start position and radius (origin must be the ball's centre) |
| `PITCH_Grass` | ground height, and where the stripes are: it needs two materials, and the darker one marks the dark stripes |
| `STATIC_Markings` | where the white lines and penalty spot are: the game paints the grass white there and hides this mesh |
| every node starting with `ADV_Panel_` | the ad boards: the ball bounces off their exact shape |
| the first glTF camera | only for "Use Blender camera" in the settings editor; the game's view comes from `src/scene/cameraSettings.ts` (see [The camera](#the-camera)) |
| the directional light (`SUN_Key`) | the sun: its direction, colour and strength are used as exported, because the baked light is lined up with it |

Coordinates: Y up, metres, shots travel toward -Z. The game shifts the model along Z so its goal line sits at z = 0.
If a node is missing or a measurement looks wrong, the game stops with an error naming it.

The goal opening is 5.64 x 2.05 m (6.0 x 2.23 m outside). `stadium_lighting.js` also finds the ad boards, corner
flags, stands, trees and floodlights by name. Apart from the ad boards, the game itself doesn't use their positions or
sizes: a ball that flies over the boards disappears in halftone dots and counts as a miss (or a save, if the keeper
touched it).

Animations in the export (like the corner flags waving) play on a loop, slowed down with the game's slow motion.
Nothing in the game refers to them by name, so a new export can add, change or drop them.

## The lighting

The light is baked in Blender (`src/scene/lighting.ts` sets it up, right after the grass):

- **Stands, railings, floodlights and the ground outside** show a baked picture, with the light, shadows and
  bounce light already in it. The railings have a picture of their own, so their shading stays smooth. **Trees**
  carry their baked light in the model's vertex colours instead, blurred across all trees so the canopies melt
  into one, with no seams. All of these ignore lights, which makes them cheap to draw.
- **Ad boards, goal and grass** keep the live sun and its shadows, plus baked soft light and soft contact
  shadows (a lightmap and an ambient-occlusion map on the model's second UV set).
- **Ball, keeper, net and corner flags** get soft light and reflections from a 360° panorama taken at the ball's
  spot, plus the live sun and shadows. Anything that moves and is made in code (like a crowd later) should get the
  same with `lightMovingObject` from `src/scene/lighting.ts`.

There is no fill light: the bakes and the panorama hold all the soft light, so adding one would count it twice.
The sun comes from the right, so the ball's shadow falls to the left. The ball and keeper cast their shadow from
their sunlit side; with three's default the ground right under the ball showed a bright gap in the shadow.

The KTX2 pictures need a decoder, served from `public/basis/`. Those two files are copies of
`node_modules/three/examples/jsm/libs/basis/`; copy them again after updating three.

## The camera

The gameplay camera stands behind the ball and looks at the goal. Its rest view is set in `CAMERA_SETTINGS` in
`src/scene/cameraSettings.ts`, tuned to match the stylised reference picture:

| Setting | What it does |
|---|---|
| `height` | how high the camera is above the grass, in metres |
| `distanceBehindBall` | how far behind the ball it stands; closer makes the ball bigger next to the goal |
| `targetHeight` | the height on the goal line it looks at; lower tilts the camera down, so the goal moves up the screen |
| `fov` | how much it sees from top to bottom, in degrees, on a 16:9 screen; smaller zooms in |
| `verticalShift` | slides the whole picture up or down (share of the screen height) without tilting the camera |

On wider screens you see more at the sides. On screens held upright the view widens just enough to keep the whole
goal in view. While you play, the camera still pushes in as you charge, sways with the mouse and shakes on impacts
(`src/scene/gameCamera.ts`). Aiming always follows the camera, so any values here keep the aim on the right spot.

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
- **Soft, ragged stripe edges and cross stripes.** The edges wobble a little and blades poke across them.
  See-through stripes run from left to right over them, counted from the goal line, like a cross-mown pitch.
- **Painted lines and spot.** The white markings in the model are hidden; the shader paints the grass white in
  their place, with blades poking out of the edges.
- **Baked light.** On top of all this, the grass gets the stadium's baked soft light and contact shadows, like
  the ad boards and goal (see [The lighting](#the-lighting)).
- **Soft patches and viewing-angle shading.** Gentle lighter and darker patches, and grass you look down onto, in
  front of the ball, is darker and deeper green than grass you look across near the goal, as real grass is.

The pictures were baked in Blender from a small patch of curly 3D blades. To make new ones, follow [docs/grass-textures.md](docs/grass-textures.md).

To change the look, try the settings in the [settings editor](#the-settings-editor), then put the ones you like in
`GRASS_SETTINGS` in `src/scene/grassSettings.ts`. Each setting has a short note there. The handiest ones:

| Setting | What it does |
|---|---|
| `colorLight`, `colorDark` | the stripe colours |
| `textureStrength` | how much of the colour picture's variation shows (0 = plain stripe colours) |
| `normalStrength` | how strongly the bumps catch the light (0 = flat) |
| `textureTileSize`, `textureStretch` | how much pitch one copy of the pictures covers, and how much longer it is toward the goal so the blades look upright |
| `stripeSoftness`, `stripeRagged` | how soft and how ragged the stripe edges are |
| `crossStripeWidth`, `crossStripeOpacity` | how wide the see-through stripes running left to right are (0 = none), and how dark they are (1 = as dark as a dark stripe) |
| `patchStrength`, `patchSize` | the soft lighter and darker patches |
| `angleShading` | how much darker the grass in front of you is (0 = the same everywhere) |
| `lineColor`, `lineRagged`, `lineWobble` | the colour of the painted lines and spot, how far blades poke out of their edges (only seen up close: far away they would flicker), and how far the edges wave in and out over 20 to 50 cm (seen on the far lines too) |

To move or resize the stripes, lines or spot, change them in Blender and export again.

## The settings editor

Add `?edit` to the end of the game's address to get a panel where you can change settings while the game runs, for
example <https://glenncttw.github.io/soccer-penalty-game/?edit>, or `http://localhost:5173/soccer-penalty-game/?edit`
with `npm run dev`. Without `?edit` the game looks and loads exactly as before.

1. Open the **Camera** or **Grass** folder and drag the sliders or click a colour. The game changes straight away.
   Hover over a setting to see its name in the settings file.
2. When you like it, click **Copy camera settings** or **Copy grass settings**. That copies the settings as code.
3. Paste them over `CAMERA_SETTINGS` in `src/scene/cameraSettings.ts` or `GRASS_SETTINGS` in
   `src/scene/grassSettings.ts` (or paste them in the project chat and Claude puts them in). Changes in the panel
   are gone when you reload the page, until they are in that file.

The **Ball fade** folder sets how the ball disappears in halftone dots after flying over the boards: the dot size,
how many dots fit across a far-away ball (it gets a finer grid there, so the dots still show), and how long it takes.
**Play the fade** plays it on the ball on the spot. Its settings go in `BALL_FADE_SETTINGS` in
`src/scene/ballFadeSettings.ts`.

**Reset camera** and **Reset grass** go back to the settings in the files, and **Use Blender camera** shows the
camera from the Blender scene. On a phone the panel starts folded up; tap
**Settings editor** to open it. Clicks and drags on the panel never take a shot.

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

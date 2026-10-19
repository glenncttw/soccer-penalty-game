# Soccer Penalty Game

A fun, playful 3D penalty shootout for the browser, built with Three.js, TypeScript, Vite and Rapier.

Swipe to shoot, bend it with curl, and dive to save in a 5-kick shootout against the AI.

See [docs/PLAN.md](docs/PLAN.md) for the gameplay scope, tech stack and milestones, and
[docs/blob-cup-study.md](docs/blob-cup-study.md) for what we learned from Blob Cup's shooting feel.

## How to play

1. **Aim**: move the mouse over the goal (on a phone, press where you want the ball to go). The target stays inside the goal frame.
2. **Power up**: press and hold. The meter on the right (below the goal on a phone held upright) goes up and down. Let go in the **gold zone** for a perfect strike.
3. **Curl**: while holding, drag left or right. The ball swings out to that side, then bends back onto your target. A line of glowing yellow dots shows the start of the curve.
4. **Shoot**: let go.

A goalkeeper tries to stop you. It watches which way the ball is heading, so a curled shot fools it, and soft
shots are easy saves. Its look is a placeholder made from simple shapes until there's a Blender model.

On your first visit, tips at the top walk you through your first shots. With a mouse, the view turns a little
toward where you point.

After a goal, a save or a shot off the woodwork, a quick wipe brings up a 3.5-second slow-motion **replay** in a
comic panel. After any other shot, the wipe just brings back the ball for the next one.

While the game loads, a plain bar in the middle of the screen fills up. In the bottom left corner you see how the
game is running: three.js's Stats panel (click it to switch between frames per second,
milliseconds per frame and memory) and a list of what was drawn in the last frame: draw calls, triangles,
geometries, textures, shaders, and the screen size in pixels. Fewer draw calls and triangles mean an easier job for
phones.

## Sharpness and phone speed

A phone screen has 2 or 3 real pixels for every CSS pixel, and drawing all of them is a lot of work. The game
always fills the whole screen, but draws its picture with fewer pixels: at most 1.5 per CSS pixel on a computer,
and on a phone the preset picked in `src/scene/resolutionSettings.ts` (`high` 1.5, `balanced` 1.25,
`performance` 1.0). It never draws more pixels than the screen really has.

Add `?bench` to the game's address to open the **sharpness test** panel (players never see it):

- The buttons switch the sharpness live: **Normal** (the setting above), 1.0, 1.25, 1.5 and 2.0 (the old setting).
  Under them: the picture's size in pixels, frames per second, milliseconds per frame, the CPU time (the game's
  own code) and the GPU time (the graphics chip; most phones, iPhones included, don't report it: "n/a").
- **Run test** measures each sharpness for 10 seconds (after 3 seconds to settle) while you leave the phone alone
  on the aiming view, then shows a table: average FPS, average frame time, the 99th-percentile frame time and the
  "1% low" FPS (the frame rate of the slowest 1% of frames), CPU and GPU time, draw calls and triangles. **Copy
  results** puts the table on the clipboard. Afterwards the sharpness goes back to what it was.
- `?bench&dpr=1.25` starts at 1.25.

## The replay

Every shot is recorded: where the ball and the keeper are in each frame (`src/gameplay/replayRecorder.ts`).
After a big moment, `src/scene/replay.ts` plays the shot back slowly in one tilted panel in the middle of a
striped purple background. Its camera sits low beside the goal, on the other side from where the ball went, and
creeps in while it follows the ball, so the ball flies into the picture and the keeper and the net are there
when it arrives.

The camera looks toward the goal, because that's the part of the stadium that's built. Turning it around would
show the unbuilt side behind the player. The ball and the keeper go back to their spots while the wipe covers
the screen, so the keeper never has to get up and walk back to the middle. The panel is drawn at 75% of the
screen's sharpness, and the normal game view isn't drawn during a replay, so a replay costs less than normal
play.

The wipe is one smooth sweep: a slanted band, wider than the screen, slides across from left to right without
stopping, and the game changes behind it at the moment it covers everything.

Settings are in `REPLAY_SETTINGS` in `src/scene/replaySettings.ts`:

| Setting | What it does |
|---|---|
| `moments` | which shots get a replay: `goal`, `save`, `woodwork` |
| `duration` | how many seconds the replay lasts |
| `slowest`, `fastest` | replay speed limits (1 = real speed); quick shots play slower to fill the time |
| `afterResult` | how long the replay keeps going after the ball went in or was saved |
| `holdWithReplay`, `holdWithout` | how long the GOAL!/MISS! banner shows before the wipe |
| `wipeTime` | seconds the wipe takes to sweep across the screen |
| `resolution` | how sharp the panel is drawn (1 = as sharp as the screen) |

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
sizes: a ball that flies over the boards fades out and counts as a miss (or a save, if the keeper touched it).

Animations in the export (like the corner flags waving) play on a loop, slowed down with the game's slow motion.
Nothing in the game refers to them by name, so a new export can add, change or drop them.

**The crowd:** Glenn's crowd person (`public/assets/crowd/crowd_person.glb`, made in Blender: origin between the feet,
facing +z) stands in the stands in 5 rows: the steps at 0.45, 0.86, 2.10, 2.50 and 2.90 m high. The wide walkway at
1.70 m (where the corner stairs come down), the narrow top step at 3.30 m and the corner stairs stay empty. It is its own
file, not part of the stadium: replace it to update the person (keep one material for all its parts). The game loads it
once (`src/scene/crowdAsset.ts`) and draws a copy at every spot in one go (`src/scene/crowd.ts`), each a little bigger or
smaller, turned a little, and with its own shirt colour: the texture's shirt colour is swapped for one from the list.
The spots are worked out at load from the `STATIC_Concrete` mesh, everything else in the model and the person's own
shape, measured in 10 cm layers (`src/scene/crowdSpots.ts`): each person stands right behind its step's barrier, facing
the pitch, and never touches a barrier, rail, wall or the person next to them. The face's shape keys (expressions)
are in the file but not used yet. Settings in `src/scene/crowdSettings.ts` (row heights, spacing, size and turn
variation, shirt colours); a new stadium export that moves the steps needs new `rowHeights`, and the game stops with
an error naming a height that has no step.

## The keeper

The keeper is Glenn's parrot, a Blender export: `public/assets/keeper/Parrot_GK.glb`, loaded by
`src/scene/keeperAsset.ts` at the size it was made in Blender (origin between the feet, facing the shooter). The
game moves and leans it with the keeper's motion; its rig and animations are in the file but nothing plays them
yet. The parrot is 1.60 m tall (scale 1 in Blender). The physics body that saves shots is still the placeholder's
(`src/physics/keeperBody.ts`, 1.52 m tall), which fits the parrot's outline closely enough until its arms animate.

The export was made lighter for the web with [glTF Transform](https://gltf-transform.dev): pictures shrunk to
1024 x 1024, colour and roughness as WebP, the normal map as JPEG (4:4:4, so it keeps its detail), and the mesh
compressed with meshopt. To update the keeper, do the same with the new export:

```sh
npx @gltf-transform/cli resize in.glb a.glb --width 1024 --height 1024
npx @gltf-transform/cli webp a.glb b.glb --slots "{baseColorTexture,metallicRoughnessTexture}" --quality 88
python3 tools/glb_image_to_jpeg.py b.glb GAME_Parrot_normal 90 c.glb
npx @gltf-transform/cli meshopt c.glb public/assets/keeper/Parrot_GK.glb
```

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

**Floodlight glow:** each floodlight lamp lights up bright white with a soft warm halo around it
(`src/scene/floodlightGlow.ts`). The lamps are found in the model: every separate piece of the `M_Floodlight_Emissive`
mesh in the `FLOOD_Light_*` nodes is one lamp (24 in all). They are drawn in one go, added on top of the sky and stands,
so it costs one tiny draw instead of a full-screen bloom. Settings in `src/scene/floodlightSettings.ts`: `glow` (on or
off), `glowSize` (how far the halo reaches, in lamp radii), `glowOpacity`, `glowColor` (the lamps) and `glowEdgeColor`
(the halo); also in the `?edit` panel under **Floodlight glow**.

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
| `cloudBlur`, `cloudLift` | how blurred the clouds are (as if out of focus, so they stay in the background), and how far up (positive) or down (negative) they sit, in degrees; lower clouds hide their bottoms behind the trees. Also in the `?edit` panel under Clouds |

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
| `textureTileSize`, `textureStretch` | how much pitch one copy of the pictures covers, and how much longer it is along the view (away from the camera) so the blades look upright. Each copy is turned to face the camera's usual spot, so the blades stand up at the sides of the screen too |
| `stripeSoftness`, `stripeRagged` | how soft and how ragged the stripe edges are |
| `crossStripeWidth`, `crossStripeOpacity` | how wide the see-through stripes running left to right are (0 = none), and how dark they are (1 = as dark as a dark stripe) |
| `patchStrength`, `patchSize` | the soft lighter and darker patches |
| `angleShading` | how much darker the grass in front of you is (0 = the same everywhere) |
| `farLight` | how much lighter and sunnier the grass gets towards the far end, where you look across it instead of down on it (0 = off) |
| `contactShadow` | how dark the soft shadows are where things meet the grass: along the ad boards and goal posts, under the keeper's feet and under the ball (they fade as the ball or keeper leaves the ground; 0 = off) |
| `lineColor`, `lineRagged`, `lineWobble` | the colour of the painted lines and spot, how far blades poke out of their edges (only seen up close: far away they would flicker), and how far the edges wave in and out over 20 to 50 cm (seen on the far lines too) |
| `lineTexture`, `lineGrassTint` | how much of the grass texture's light and dark, and how much of its green, shows through the paint, so the lines and spot look like paint on grass instead of flat white (keep `lineColor` a little below pure white, or the sun turns it flat white again) |

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

The **Clouds** and **Floodlight glow** folders work the same way, with **Copy sky settings** for `SKY_SETTINGS` in
`src/scene/skySettings.ts` and **Copy glow settings** for `FLOODLIGHT_SETTINGS` in `src/scene/floodlightSettings.ts`.

The **Wipe** folder changes how long the wipe takes to sweep across the screen;
**Play wipe** shows it straight away, and **Copy replay settings** copies them for `REPLAY_SETTINGS` in
`src/scene/replaySettings.ts`.

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

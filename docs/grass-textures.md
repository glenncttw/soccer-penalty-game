# Making the grass textures in Blender

The pitch uses two pictures that repeat over the grass:

- a **colour picture** (`grass_albedo`): what the grass looks like from straight above, with no light or shadow in it;
- a **normal map** (`grass_normal`): which way each bit of the grass surface faces, so the game's sun can light the
  bumps itself.

The ones in the game now were made this way, from a patch of 5,200 small curly blades. Follow this guide to make
new ones. You bake both pictures from a small patch of 3D grass onto a flat square.

## What the game needs

| | |
|---|---|
| Files | `grass_albedo.png` and `grass_normal.png` |
| Size | 1024 x 1024 pixels, 8-bit PNG, no transparency |
| Patch size in Blender | 0.5 x 0.5 m |
| Seamless | the right edge must continue into the left edge, and the top into the bottom |
| Which way is up | the top of the picture (Blender's +Y, the green axis) points toward the goal |
| Normal map type | tangent space, OpenGL (Blender's default) |
| Light | none: no shadows, no sun, no ambient occlusion in the colour picture |

The game stretches the pictures 3 times longer toward the goal (`textureStretch` in `src/scene/grassSettings.ts`).
You look at the grass from very low, which squashes it; the stretch makes round curls look round again. So make
your curls round in Blender and let the game do the rest.

## What the grass should look like

These are tips to get close to the reference picture, not rules.

- **Small curly blades, lying low.** The picture is the grass seen from straight above, so blades that stand up
  straight show up as dots. Blades that curl over and lie fairly flat show their shape. Curls of about 2 to 4 cm
  across, blades about 2 to 6 mm wide, tapering to the tip.
- **Dense.** Let the blades overlap so only a little ground shows between them. Put a dark green ground plane
  under the blades so the gaps aren't empty.
- **Gentle colour changes.** Tips a little lighter and yellower, the low parts and the ground a little darker. A
  Color Ramp on the blades' height works well: Geometry node, Position, Separate XYZ, take Z, Map Range, Color
  Ramp, into Base Color. Keep it gentle; the game adds its own light and shade.
- **Any green is fine.** The game only uses the picture's variation around its own average colour, so the stripe
  colours stay as they are. What matters is how much lighter and darker the blades are than the average.

## 1. Set up the scene

1. **File > New > General.** Click the cube, press **X**, then **Delete**.
2. Set **Render Properties > Render Engine** to **Cycles**. Baking only works in Cycles.
3. Make the bake target: **Add > Mesh > Plane**. Press **N** to open the side panel. On the **Item** tab set
   **Location** to X `0.5 m`, Y `0.5 m`, Z `0`, and **Dimensions** to X `0.5 m`, Y `0.5 m`. Press **Ctrl+A**,
   choose **Scale**. Double-click its name in the Outliner and call it `BakeTile`.

## 2. Make the grass patch and make it tile

1. Build your grass and its dark ground plane as **one object** on a 0.5 x 0.5 m square, centred on the origin
   (from -0.25 to +0.25 m on X and Y). Blades may stick out past the edges; that's what makes the seams invisible.
   - With Geometry Nodes: *Distribute Points on Faces* on the square, *Instance on Points* with your blade, a
     *Random Value* into the rotation, and **a *Realize Instances* node at the end**.
   - Your own way is fine too, as long as it ends up as real geometry in one object.
2. Select that grass object. In **Modifier Properties** add an **Array** modifier: **Count** `3`, untick
   **Relative Offset**, tick **Constant Offset**, set its **Distance X** to `0.5 m` and Y and Z to `0`.
3. Add a second **Array** modifier below it: **Count** `3`, untick **Relative Offset**, tick **Constant Offset**,
   **Distance Y** `0.5 m`, X and Z `0`.

You now have 3 x 3 identical patches, and `BakeTile` sits exactly over the middle one. Blades from the
neighbouring patches hang over its edges, so the baked picture continues seamlessly on every side.

## 3. Give the bake target two empty pictures

1. Select `BakeTile`. In **Material Properties** click **New**.
2. Open the **Shading** workspace. In the node editor, press **Shift+A**, search **Image Texture** and place it
   (don't connect it to anything). Click **New**: name `grass_albedo`, width and height `1024`, untick **Alpha**,
   click **OK**.
3. Add a second **Image Texture** node the same way: name `grass_normal`, `1024` x `1024`, untick **Alpha**. Then set
   that node's **Color Space** to **Non-Color**. This matters: a normal map holds directions, not colours.

## 4. Bake the colour picture

1. In the Outliner, click the grass object, then **Ctrl+click** `BakeTile`, so both are selected and `BakeTile` is
   the active one (its name is lighter).
2. In the node editor, click the `grass_albedo` node once so it is the active node (white outline). Blender bakes
   into whichever image node is active.
3. In **Render Properties > Bake**:
   - **Bake Type**: **Diffuse**
   - **Contributions**: untick **Direct** and **Indirect**, keep only **Color** ticked. This leaves out all light
     and shadow.
   - Tick **Selected to Active**. Leave **Cage** off and set **Extrusion** to a bit more than your tallest blade,
     for example `0.1 m`. **Max Ray Distance** can stay `0`.
4. Click **Bake** and wait until the progress bar is gone.

## 5. Bake the normal map

1. Click the `grass_normal` node once so it is the active node.
2. In **Render Properties > Bake** set **Bake Type** to **Normal**. Check that **Space** is **Tangent** and that
   **R**, **G**, **B** are **+X**, **+Y**, **+Z** (the defaults). Keep **Selected to Active** and the same
   **Extrusion**.
3. Click **Bake**.

## 6. Save both pictures

1. Open an **Image Editor** (or the image area in the Shading workspace) and pick `grass_albedo` from its image
   list.
2. **Image > Save As**. Set **File Format** to **PNG**, **Color** to **RGB**, **Color Depth** to **8**. If you see
   **Save as Render**, untick it (otherwise Blender's colour look changes the picture). Save as `grass_albedo.png`.
3. Do the same for `grass_normal`, saved as `grass_normal.png`. A good normal map looks mostly light purple-blue.
   The colour picture should look flat, with no sunny side.

## 7. Put them in the game

Send both PNGs in the project thread. Claude converts them to the small web formats the game loads (the colour
picture becomes `grass_albedo.webp`, the normal map `grass_normal.jpg`), puts them in `public/assets/grass/`,
checks the seams and tunes the settings to match.

## Tuning afterwards

All in `GRASS_SETTINGS` in `src/scene/grassSettings.ts`:

| Setting | What it does |
|---|---|
| `textureStrength` | how much of the colour picture's variation shows (0 = plain stripe colours) |
| `normalStrength` | how strongly the bumps catch the light (0 = flat). Baked blades that lie low give gentle bumps, so the game turns them up (2.5 now) |
| `textureTileSize` | how much pitch one picture covers across, in metres (0.5 matches this guide) |
| `textureStretch` | how much longer it is toward the goal (1 = not stretched) |

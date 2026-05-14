# Cellshire — Asset Generation Cookbook

How to generate new tiles, ores, and props for Cellshire from your phone
using Wyltek Studio. The recipe that worked for the v0 mining pack:

## The unlock — use reference-image editing, not text-only

Text-only diffusion ("generate me a voxel slab") produces smooth 3D
frames because every diffusion model is biased toward smooth surfaces.
**Reference-image conditioning** is what locks the Minecraft-cube style:
you feed the model an existing tile from the Mykonos pack and ask it to
change *only* the colour/material.

You should have the Mykonos source PNGs on your phone — those are your
reference anchors. Use them in **edit mode**, not text-only mode.

## Wyltek Studio setup

| Setting | Value |
|---|---|
| Backend | **HiDream-O1** (`/render/edit` route) |
| Mode | **Image edit / edit-with-reference** (not text-to-image) |
| Reference image | One of the Mykonos source tiles |
| Model type | `dev` (faster, ~110s) for iteration; `full` (~3 min) for final |
| Width × Height | 1024×1024 for ore clusters; 1536×1024 for ground tiles |
| `keep_original_aspect` | true |
| Seed | Any — keep it noted if you love the result and want to re-roll the prompt with the same composition |

### Does the "adaptor" do anything here?

No separate adapter / IP-Adapter / ControlNet needed — HiDream-O1's
`/render/edit` endpoint takes a `ref_image_path` directly. The edit mode
*is* the adapter. If Wyltek Studio's UI exposes an "image-edit" or
"img2img" mode, that's the one to pick. If it only shows text-to-image
on your phone, you may need to either:

1. Switch Wyltek Studio to the `feature/image-edit-page` branch (image
   edit UI via Kontext + Qwen-Image-Edit), or
2. POST directly to `http://wyltek-studio-host:9092/render/edit` via a
   REST client (curl, Postman, or HTTPie) using the JSON template at
   the end of this doc.

## The three load-bearing prompt phrases

Every successful prompt has these three pieces. Drop any of them and the
output drifts:

1. **`"Same isometric voxel cube style as the reference image, identical
   Minecraft-style pixel cube grid composition, identical thick slab
   shape, identical 30-degree isometric viewing angle, identical
   proportions, identical lighting direction."`**
   — Anchors style. Repeat all the "identical" phrases verbatim — the
   redundancy is load-bearing because diffusion will drift on any axis
   you don't explicitly pin.

2. **`"Change only the colour and material: <one short paragraph
   describing the new ore/material>"`**
   — Gives permission to deviate on exactly one axis. Be specific: name
   the colour (e.g. "rust-red", "rich royal purple", "cobalt blue"), the
   material (iron oxide, amethyst crystal, copper ore with verdigris),
   and where the colour concentrates ("in veins, not uniformly", "as
   distinct nuggets", "as faceted crystal points").

3. **`"Keep the cubic pixel-grid look exact, no smoothing, no rounding.
   Plain solid light grey background."`**
   — Guardrail against the smooth-surface bias and ensures the background
   is uniform so rembg can cut it cleanly afterwards.

## Reference image picker

Match the *shape* you want to the right Mykonos source:

| Want | Ref to use | Why |
|---|---|---|
| Ground tile (terrain) | `stone.png` or `sand.png` or `grass.png` | Diamond slabs with side strata |
| Big chunky ore deposit | `boulder.png` | Big rounded mound, lots of cubes |
| Medium ore cluster | `large_rock.png` | Pyramidal cluster, mid-density |
| Small precious ore | `mossy_stone.png` | Compact stepped cluster, geode-sized |
| Signature vertical landmark | `stone_pile.png` | Stacked tower, distinctive silhouette |
| Building / structure | `house.png` / `villa.png` / `main_chapel.png` | Has windows + roof + walls |
| Plant / tree | `cypress.png` / `olive.png` | Vertical organic silhouette |
| Small prop (pot, lantern, etc) | `flower_pot.png` / `lantern_post.png` / `bench.png` | Small object, narrow footprint |

## Prompt templates

### Terrain tile

```
Same isometric voxel cube tile style as the reference image, identical
Minecraft-style pixel cube grid composition, identical thick slab shape,
identical 30-degree isometric viewing angle, identical proportions,
identical lighting direction.

Change only the colour: <NEW MATERIAL>, instead of <REFERENCE MATERIAL>.
The top face is a grid of <COLOUR + MATERIAL> voxel cubes with <SECONDARY
COLOUR VARIATION> and <SMALL ACCENT DETAIL>. The side faces show layered
<STRATA DESCRIPTION>.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain
solid light grey background.
```

Example (lava tile):

> Change only the colour: bright glowing molten lava, instead of cream
> stone. The top face is a grid of bright orange and red lava voxel cubes
> with deeper crimson cracks and a few bright yellow-white hot-spot
> cubes. The side faces show layered dark basalt strata cooling at the
> edges.

### Ore deposit

```
Same isometric voxel cube cluster style as the reference image, identical
Minecraft-style pixel cube mound shape, identical 30-degree isometric
viewing angle, identical proportions, identical lighting direction.

Change only the colour and material: <ORE NAME> deposit. The cluster is
made of small distinct voxel cubes in <PRIMARY COLOUR> for <MATERIAL>,
with <SECONDARY COLOUR> for <SECONDARY MATERIAL>, and dark slate grey
for the surrounding stone matrix. <DISTRIBUTION DESCRIPTION — veins,
nuggets, scattered, concentrated>. <OPTIONAL ACCENT — sparkle, glow,
oxidation>.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain
solid light grey background.
```

Example (sulphur vein):

> Change only the colour and material: sulphur vein deposit. The cluster
> is made of small distinct voxel cubes in bright vivid yellow for the
> sulphur crystals, with mustard-orange weathered patches, and dark
> slate grey for the surrounding stone matrix. The sulphur concentrates
> in jagged streaks running through the mound. A few cubes glow slightly
> with toxic acid-yellow.

### Prop / interactive object

For ore carts, anvils, signs, lanterns, etc. — use a Mykonos prop like
`lantern_post.png` or `signpost.png` as the ref.

```
Same isometric voxel object style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric
viewing angle, identical scale, identical lighting direction.

Replace the object entirely: a <NEW OBJECT NAME>. Built from voxel cubes
in <PRIMARY COLOUR + MATERIAL>, with <SECONDARY MATERIAL DETAIL>, and
<ACCENT DETAIL>. <BRIEF DESCRIPTION OF SHAPE/SILHOUETTE>.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain
solid light grey background.
```

Example (ore cart):

> Replace the object entirely: a wooden mining ore cart with iron wheels.
> Built from voxel cubes in warm oak-brown wood for the cart body, with
> dark grey iron banding and bracket reinforcements, and four small
> dark iron wheels at the corners. Inside the cart sits a small pile of
> dark grey ore cubes. The cart sits flat on the ground.

### Character skin

Use a Mykonos cypress or olive tree as a vertical silhouette anchor —
it's awkward but it works because both encode "tall thin standing thing".

```
Same isometric pixel-cube style as the reference image, identical
Minecraft-style construction, identical 30-degree isometric viewing
angle, identical scale, identical lighting direction.

Replace the object entirely: a small standing character — a chunky pixel
miner with a <DESCRIPTION OF HEAD/HAIR>, wearing <CLOTHING DESCRIPTION>,
holding a <TOOL>. <ANY ACCESSORIES>. Built from voxel cubes throughout,
with visible cubic pixel construction even on the body.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain
solid light grey background.
```

⚠️ Characters are harder than tiles/ores because diffusion has weaker
priors on "pixel-cube character" than "pixel-cube terrain". Expect 2–3
retries with seed changes per skin before getting a usable one.

## Workflow on your phone

1. **In Wyltek Studio**: pick HiDream-O1 → image-edit mode → upload the
   Mykonos reference image → paste a prompt from above → set width/height
   → generate.
2. **Result PNG arrives**: download to phone.
3. **Background removal**: either use Wyltek Studio's built-in cut-out
   tool (uses rembg) OR send to your driveThree workflow via the
   `cut-subject` skill / shared folder.
4. **Send to driveThree**: place in `~/cellshire/assets/raw_pending/`.
5. **Process & install**: `cd ~/cellshire && python3 tools/process_assets.py --pending`
   trims tight to the alpha bounding box and installs to `assets/`.
6. **Wire**: add a one-line entry to `src/assets/assetManifest.js` —
   - Terrain: `{ ...T('asset_id', 'Asset Name'), tileLike: true, builder: A.tileWhiteStone }`
   - Ore: `{ ...P('asset_id', 'Asset Name', { w: 1, d: 1 }, 0.80), builder: A.boulder }`
   - Building: `{ ...B('asset_id', 'Asset Name', { w: 2, d: 2 }), builder: A.smallMykonosHouse }`
7. **Refresh** `http://127.0.0.1:8766/` — done.

## Raw API JSON template (for direct REST calls)

If you want to skip the Wyltek UI entirely, post this to the HiDream
worker directly:

```json
POST http://192.168.68.XXX:9092/render/edit
Content-Type: application/json

{
  "prompt": "<paste your full prompt here>",
  "ref_image_path": "/path/on/server/to/mykonos_reference.png",
  "width": 1024,
  "height": 1024,
  "seed": 4242,
  "model_type": "dev",
  "keep_original_aspect": true,
  "output_dir": "/tmp/cellshire-gen/my_asset_v1"
}
```

Response after ~110s:

```json
{
  "png_path": "/tmp/cellshire-gen/my_asset_v1/out.png",
  "elapsed_s": 108.79,
  "actual_width": 2240,
  "actual_height": 1856
}
```

(HiDream snaps to its preferred internal resolution; that's fine.)

## Tips from the v0 batch

1. **"Concentrate in veins, not uniformly distributed"** is gold for ore
   prompts — without it the model paints the ore evenly through every
   cube and the result reads as "this entire rock is gold" rather than
   "this rock has gold veins in it".
2. **Crystal ores can break the cube convention** — diffusion will give
   you faceted crystal points for amethyst / diamond / ckb_cluster even
   if you ask for pure cubes. **Let it.** That visual hierarchy
   (cube = ordinary, faceted = magical) is design value, not a bug.
3. **"Inner glow"** works if you surround the bright element with dark
   neighbours. Luminance is *contrast*, not colour alone.
4. **Specific & unusual materials produce more dramatic results** than
   generic ones. "Sulphur vein" pops harder than "yellow stone" because
   the model has stronger priors on the specific term.
5. **Seed is your friend** — if a generation has the right composition
   but wrong colour mix, hold the seed and tweak the prompt. Composition
   stays, materials shift.
6. **Don't iterate in full mode** — `dev` mode is 2.5× faster and the
   composition is the same; use full only when you're locking in the
   final.

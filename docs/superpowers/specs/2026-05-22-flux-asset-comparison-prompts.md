# Flux Asset Comparison Prompts

Use these prompts to compare Flux, Flux.2 Klein, HiDream, SD3, or SenseNova
outputs for the Cellshire resource/building pass. Prefer image-edit/reference
conditioning where available. The reference image matters more than the model
for preserving Cellshire's current isometric voxel language.

## Shared Style Anchor

Add this to every prompt:

```text
Same isometric voxel object style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.
Keep the cubic pixel-grid look exact, no smoothing, no rounding, no glossy 3D
plastic, no realistic render, no painterly brushwork. Plain solid light grey
background.
```

## Negative Prompt

```text
photorealistic, smooth 3d render, rounded shapes, clay render, soft toy,
low-poly, painterly, watercolor, anime, flat icon, vector art, UI icon, text,
logo, watermark, complex background, floor plane, cast shadow, cropped subject,
multiple objects, blurry, noisy edges
```

## Suggested Settings

- Flux.2 Klein edit: `1024x1024`, 28-34 steps, guidance/CFG `3.0-3.5`.
- Flux.1 schnell text/image: `1024x1024`, 4-8 steps, CFG `1.0`.
- Use a fixed seed for each A/B pair so Flux and Flux.2 can be compared
  against the same prompt intent.
- Keep outputs on a flat light grey background first; cut transparency after
  selecting the winner.

## Asset Prompts

### harvest_tree

Reference: `assets/raw/olive.png` or `assets/raw/cypress.png`.

```text
Same isometric voxel tree style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: a harvestable timber tree for a cozy mining town.
The trunk is chunky warm brown voxel wood, the canopy is compact deep green
voxel leaves, and a few cuttable branch cubes are visible. It should read as a
resource node players can harvest for wood, not a decorative garden tree.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### stone_outcrop

Reference: `assets/raw/boulder.png` or `assets/raw/large_rock.png`.

```text
Same isometric voxel rock cluster style as the reference image, identical
Minecraft-style pixel cube mound shape, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Change only the material: a harvestable stone outcrop for building materials.
The cluster is made of grey limestone and dark slate voxel cubes, with chipped
angular blocks and a few lighter freshly-broken faces. It must look like
construction stone, not a crypto ore deposit.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### gold_nugget_node

Reference: `assets/raw/mossy_stone.png` or `assets/raw/large_rock.png`.

```text
Same isometric voxel cluster style as the reference image, identical
Minecraft-style pixel cube mound shape, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Change only the colour and material: a small gold nugget resource node for
crafting. Use warm metallic yellow-gold voxel cubes as distinct nuggets in a
dark stone matrix. Keep the gold concentrated in a few chunky visible nuggets
rather than coating the whole rock.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### farm_plot_empty

Reference: `assets/raw/garden_bed.png`.

```text
Same isometric voxel garden bed style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical footprint, identical scale, identical lighting direction.

Change the plot state to empty prepared soil. The bed has clear voxel soil rows,
small raised wooden edges, and a compact readable farm-game silhouette. No
plants yet, only tidy dark soil ready for planting.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### farm_plot_starter_crop

Reference: `assets/raw/crop_patch.png` or `assets/raw/garden_bed.png`.

```text
Same isometric voxel garden bed style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical footprint, identical scale, identical lighting direction.

Change the plot state to starter crop. The bed has dark voxel soil rows with
small blocky green shoots and a few compact leafy crop cubes, clearly readable
as early growth but not fully mature.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### farm_plot_ready_crop

Reference: `assets/raw/veg_garden.png` or `assets/raw/crop_patch.png`.

```text
Same isometric voxel garden bed style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical footprint, identical scale, identical lighting direction.

Change the plot state to mature harvest-ready crop. The bed has dense blocky
green leaves, a few warm yellow crop cubes, and clear soil rows still visible
between plants. It should read as ready to harvest.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### workbench

Reference: `assets/raw/bench.png` or `assets/raw/storage_box.png`.

```text
Same isometric voxel prop style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: a compact crafting workbench for a cozy mining
settlement. Built from warm oak-brown voxel planks, with a sturdy tabletop,
small tool cubes, a clamp, and a few stacked crafting materials. It must be
readable as a workbench from game distance and fit one home-base tile.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### tool_rack

Reference: `assets/raw/storage_box.png` or `assets/raw/bench.png`.

```text
Same isometric voxel prop style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: a compact tool rack for pickaxe upgrades. Built
from warm brown voxel wood with dark iron brackets. Include two visible pickaxe
shapes, a hammer shape, and small metal tool heads, arranged on a simple upright
rack. Keep it compact and readable in one tile.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### sawmill

Reference: `assets/raw/wood_pile.png` or `assets/raw/bench.png`.

```text
Same isometric voxel prop/building style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: a tiny home-base sawmill for wood processing.
Built from warm timber voxel beams, with a small saw frame, stacked log cubes,
plank piles, and dark iron blade details. It should read as a functional
building upgrade while staying compact enough for a home-base tile.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### stone_yard

Reference: `assets/raw/stone_pile.png` or `assets/raw/boulder.png`.

```text
Same isometric voxel prop/building style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: a compact stone yard for masonry processing.
Built from grey limestone voxel blocks, dark slate blocks, a small chisel bench,
stacked cut stone cubes, and a few freshly chipped light faces. It should read
as a home-base stone processing station, not a crypto ore deposit.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### farm_storage

Reference: `assets/raw/storage_box.png` or `assets/raw/crate.png`.

```text
Same isometric voxel prop/building style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: compact farm storage for a cozy home base. Built
from warm wooden voxel crates, a small roofed bin, sacks, crop baskets, and a
few green vegetable cubes. It should read as storage capacity for farming, not a
market stall.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### pickaxe_reinforced

Reference: `assets/raw/stone_lantern.png` for narrow upright scale, or
`assets/raw/bench.png` for object scale.

```text
Same isometric voxel object style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: a reinforced pickaxe upgrade icon as a small
placeable voxel object. Warm wooden handle, dark iron pickaxe head, a few stone
chips near the base, and one simple metal band. Make the silhouette clear and
chunky, suitable for a tool upgrade visual.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

### pickaxe_steel

Reference: `assets/raw/stone_lantern.png` for narrow upright scale, or
`assets/raw/bench.png` for object scale.

```text
Same isometric voxel object style as the reference image, identical
Minecraft-style pixel cube construction, identical 30-degree isometric viewing
angle, identical proportions, identical scale, identical lighting direction.

Replace the object entirely: a steel pickaxe upgrade icon as a small placeable
voxel object. Dark polished steel pickaxe head, reinforced warm wooden handle,
two iron bands, and a subtle bright edge on the tool head. It should look like a
clear higher-tier pickaxe without becoming magical or oversized.

Keep the cubic pixel-grid look exact, no smoothing, no rounding. Plain solid
light grey background.
```

## Comparison Matrix

For each asset, save variants with this naming pattern:

```text
tmp/resource-asset-generation/<asset-id>/<model>-seed<seed>.png
```

Suggested first pass:

| Asset | Ref | Flux.1 seed | Flux.2 seed |
|---|---|---:|---:|
| `workbench` | `assets/raw/bench.png` | 2201 | 2201 |
| `tool_rack` | `assets/raw/storage_box.png` | 2202 | 2202 |
| `sawmill` | `assets/raw/wood_pile.png` | 2203 | 2203 |
| `stone_yard` | `assets/raw/stone_pile.png` | 2204 | 2204 |
| `farm_storage` | `assets/raw/storage_box.png` | 2205 | 2205 |
| `harvest_tree` | `assets/raw/olive.png` | 2206 | 2206 |
| `stone_outcrop` | `assets/raw/boulder.png` | 2207 | 2207 |
| `gold_nugget_node` | `assets/raw/mossy_stone.png` | 2208 | 2208 |
| `farm_plot_empty` | `assets/raw/garden_bed.png` | 2209 | 2209 |
| `farm_plot_starter_crop` | `assets/raw/crop_patch.png` | 2210 | 2210 |
| `farm_plot_ready_crop` | `assets/raw/veg_garden.png` | 2211 | 2211 |
| `pickaxe_reinforced` | `assets/raw/stone_lantern.png` | 2212 | 2212 |
| `pickaxe_steel` | `assets/raw/stone_lantern.png` | 2213 | 2213 |
```

## Selected Resource/Building Outputs

- `workbench` <- `workbench_c_sturdy`
- `tool_rack` <- `tool_rack_b_wall`
- `sawmill` <- `sawmill_c_logs`
- `stone_yard` <- `stone_yard_c_crane`
- `farm_storage` <- `farm_storage_c_harvest`
- `harvest_tree` <- `harvest_tree_c_stump`
- `stone_outcrop` <- `stone_outcrop_b_stack`
- `gold_nugget_node` <- `gold_nugget_node_a_matrix`
- `farm_plot_ready_crop` <- `farm_plot_ready_crop_c_full`

Installed transparent previews:

- `tmp/resource-asset-generation/building-candidates/installed/contact-sheet.png`
- `tmp/resource-asset-generation/resource-candidates/installed/contact-sheet.png`

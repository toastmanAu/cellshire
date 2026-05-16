# Cellshire — Character Prompts (v0)

Three starter player skins to generate via HiDream-O1 in Wyltek Studio,
designed to fit the chunky pixel-cube aesthetic of the v0 asset pack
(see [ASSET-PROMPTS.md](ASSET-PROMPTS.md) for the broader recipe).

Each character is 2 voxels wide × 4 voxels tall (a sturdy adult build),
which lands at **32 × 64 px on screen at default zoom** once the asset
loader scales the trimmed PNG to `sizeScale: 0.5`.

## Generation settings (Wyltek Studio)

- **Mode**: HiDream-O1 → image-edit / edit-with-reference
- **Reference image**: `assets/cypress.png` (vertical silhouette anchor)
- **Width / Height**: `768 × 1536` (portrait 1:2 — keeps the proportions
  the asset loader expects)
- **Steps**: 50, **CFG**: 7.5, **Model**: `dev`
- **Seed**: any — note the one you like in case you want to re-roll

> Diffusion has weaker priors on "pixel-cube character" than on pixel-
> cube terrain (per ASSET-PROMPTS.md §183). Plan to roll each prompt
> 2–3× with seed changes to land a clean voxel-cube body.

## After generation

1. Background removal (Wyltek Studio's built-in cut-out, or send to
   driveThree via the `cut-subject` skill).
2. Save each result as:
   - `~/cellshire/assets/raw_pending/player_miner.png`
   - `~/cellshire/assets/raw_pending/player_seeker.png`
   - `~/cellshire/assets/raw_pending/player_tinker.png`
3. From `~/cellshire`, run:
   ```bash
   python3 tools/process_assets.py --pending
   ```
   The trimmer installs them into `assets/` and the manifest entries
   pick them up on next page load.
4. Test each in the browser:
   ```
   http://127.0.0.1:8766/?character=miner
   http://127.0.0.1:8766/?character=seeker
   http://127.0.0.1:8766/?character=tinker
   ```
   No flag = the cobalt-cube placeholder (still works, useful for diff).

---

## 1. `player_miner.png` — Stout Prospector

The default. Beardy, sturdy, clearly out to dig something out of a hill.

```
Same isometric pixel-cube style as the reference image, identical
Minecraft-style construction, identical 30-degree isometric viewing
angle, identical scale, identical lighting direction.

Replace the object entirely: a small standing character — a chunky
pixel-cube miner with a thick brown braided beard and ruddy cheeks,
wearing a tan leather apron over a deep-blue work shirt and brown
canvas trousers, holding a small iron pickaxe in one hand. A bright
yellow miner's helmet with a tiny lit lamp on the front sits on his
head. Sturdy brown leather boots. Two voxels wide, four voxels tall.
Built from voxel cubes throughout, with visible cubic pixel
construction even on the body, beard, and clothing.

Keep the cubic pixel-grid look exact, no smoothing, no rounding.
Plain solid light grey background.
```

## 2. `player_seeker.png` — Robed Crystalwright

The mystic. Drawn to ckb_clusters and rare ore; less about brute force,
more about reading the rock.

```
Same isometric pixel-cube style as the reference image, identical
Minecraft-style construction, identical 30-degree isometric viewing
angle, identical scale, identical lighting direction.

Replace the object entirely: a small standing character — a chunky
pixel-cube robed seeker with a deep cowl pulled half-up over the
head, faceless under the hood except for two bright cyan glowing
eye-points. Wearing a deep royal-purple ankle-length robe with thin
gold trim at the cuffs and hem, faceted cyan crystal inlays along
the shoulders. Holding a slim cyan crystal staff topped with a small
glowing geode. Two voxels wide, four voxels tall. Built from voxel
cubes throughout, with visible cubic pixel construction even on the
robe and hood; faceted crystal points on the staff and shoulders are
allowed to break the cube convention.

Keep the cubic pixel-grid look exact, no smoothing, no rounding.
Plain solid light grey background.
```

> The "faceted crystal points break the cube convention" line is
> deliberate — same trick used for the `ckb_cluster` in v0 (see
> ASSET-PROMPTS.md §245). Diffusion will give you crystal facets;
> let it, the visual hierarchy is design value.

## 3. `player_tinker.png` — Goggled Engineer

The technical. Brass + leather + gears — for the player who'll build
a CKB ore cart before they finish their first mine.

```
Same isometric pixel-cube style as the reference image, identical
Minecraft-style construction, identical 30-degree isometric viewing
angle, identical scale, identical lighting direction.

Replace the object entirely: a small standing character — a chunky
pixel-cube engineer with brass aviator goggles pushed up onto messy
copper-red hair, wearing an olive-green canvas utility jumpsuit
with rolled sleeves, a brown leather tool harness across the chest
with small brass gear loops and a coiled length of copper wire on
one hip. Holding a small brass wrench in one hand. Sturdy copper-
toed boots. Two voxels wide, four voxels tall. Built from voxel
cubes throughout, with visible cubic pixel construction even on the
body and jumpsuit; brass details on goggles, gears, and wrench have
a slight metallic sheen.

Keep the cubic pixel-grid look exact, no smoothing, no rounding.
Plain solid light grey background.
```

---

## Tips specific to characters (lessons from v0)

1. **Lock the silhouette to 2×4 voxels** in the prompt. Diffusion will
   otherwise drift to 1×3 (chibi) or 3×6 (too tall to read against
   single-voxel ore tiles).
2. **Beards, robes, harnesses are anchors** that help the model encode
   "person not column". The bare default character prompt often produces
   things that look like flagpoles.
3. **One bright spot per character** — yellow helmet lamp, cyan crystal,
   brass goggles. Reads at a glance even at min-zoom 0.5×.
4. **Background must be plain light grey**, NOT white. Pure white
   makes rembg pick up bright pixels in the helmet/crystals as
   "background". Light grey is safe.
5. **If the face renders messy**, hide it: pull the hood lower, push
   the goggles down, add a beard. Faces at this resolution are a
   diffusion trap.
6. **Save your good seeds**. Once you've found a seed that produces a
   clean silhouette for one character, the same seed often works for
   the other two with prompt changes only — composition is sticky.

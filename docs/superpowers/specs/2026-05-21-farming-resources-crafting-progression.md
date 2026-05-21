# Farming, Resources, and Crafting Progression

Status: proposed next progression track.

## Goal

Add a second progression loop beside crypto mining:

1. Harvest epoch-refreshing public-map resources.
2. Grow crops and materials in an expandable home farm zone.
3. Craft buildings/upgrades at home.
4. Upgrade tools over time for better mining and harvesting returns.

This should support long-term play without turning every reward into direct
crypto payout. It also gives the property zone more mechanical purpose.

## Resource Types

### Public Mine / Epoch Map

These resources refresh with the CKB epoch, like ore deposits:

- `stone_resource`: mineable stone outcrops.
- `wood_resource`: harvestable procgen trees.
- `gold_resource`: optional material reward from gold deposits or a distinct
  gold nugget node.

Target behavior:

- Trees are procgen scatter on suitable terrain and refresh every epoch.
- Tree harvesting grants `wood`.
- Stone outcrops grant `stone`.
- Gold material can either piggyback on `gold_ore` hits or become a separate
  rare `gold_nugget` node. This needs a decision because `gold_ore` already
  maps to BTC in the current crypto economy.

### Home Farm Zone

The player home gains an expandable farm zone distinct from decorative claim
expansion.

First crop/material candidates:

- `crop`: generic starter crop used for early crafting.
- `herb`: faster low-value crop for basic recipes.
- `timber_plot`: planted tree/sapling that grows into wood over time.

Target behavior:

- Farm plots unlock at home and expand through tiers.
- Crops use local timers first; later they can be backed by resume-state cells.
- Harvested farm outputs go into local resource inventory.
- Farm progression should not depend on live wallet state in v1.

## Resource Inventory

Add a resource inventory separate from crypto currency balances and prop
inventory:

```js
{
  wood: 0,
  stone: 0,
  gold: 0,
  crop: 0,
  herb: 0
}
```

These are gameplay materials, not token balances. They can later become cells
if the economy warrants it, but the first slice should stay local and fast.

## Crafting / Building Unlocks

Crafting should let players turn resources into home-base capabilities:

- `workbench`: unlocks basic crafting.
- `tool_rack`: unlocks pickaxe upgrades.
- `sawmill`: improves wood conversion or unlocks timber recipes.
- `stone_yard`: improves stone conversion or unlocks walls/foundation recipes.
- `farm_storage`: increases farm/resource capacity.

Crafted buildings should be placed at home like props, but they also grant
capabilities. Keep capability state deterministic from owned/placed crafted
buildings where possible.

## Tool Upgrades

Pickaxe upgrades should be an early progression spine:

| Tier | Name | Example Cost | Effect |
|---|---|---:|---|
| 1 | Rusted pickaxe | starter | baseline mining/harvesting |
| 2 | Reinforced pickaxe | wood + stone | modest mining yield/capacity speed |
| 3 | Gold-tipped pickaxe | wood + stone + gold | better mining and rare-resource returns |
| 4 | Cellsteel pickaxe | rare materials + CKB | late prototype upgrade |

Effects need tuning. Candidate knobs:

- More resource yield per harvest.
- More ore value extracted per hit.
- Faster depletion for public resources.
- Better chance at bonus material drops.

Avoid multiplying crypto payout too aggressively until the pricing pass is
done.

## Asset Generation Needs

Use ComfyUI/Wyltek Studio with Flux/Flux2/SD3/HiDream/SenseNova depending on
which model is strongest for the target asset. Reference-image editing should
remain the default because it preserves the current isometric voxel style.

Initial asset list:

- `wood_resource` / harvestable tree stump or timber tree.
- `stone_resource` / stone outcrop.
- `gold_nugget` or `gold_resource`, if separated from `gold_ore`.
- `farm_plot_empty`.
- `farm_plot_crop`.
- `farm_plot_herb`.
- `sapling_plot`.
- `workbench`.
- `tool_rack`.
- `sawmill`.
- `stone_yard`.
- `farm_storage`.
- Pickaxe icons or held-tool sprites for tiers 2-4.

## First Implementation Slice

Recommended first card: **Resource Inventory + Wood/Stone Harvesting**.

Acceptance:

- Add local resource inventory with persistence and tests.
- Add procgen wood/stone resource nodes to the public map.
- Clicking a resource walks adjacent and harvests it.
- Harvesting grants `wood` or `stone`, depletes the node locally, and respects
  epoch mined-state style persistence.
- HUD shows compact resource balances.
- No crafting or farming timers yet.

## Follow-up Cards

1. **Expandable Farm Zone MVP**
   - Add home farm bounds and tiered expansion.
   - Add placeable farm plots.
   - Add simple plant/harvest flow with local timers.

2. **Crafting Building Unlocks**
   - Add recipe model.
   - Add workbench/tool-rack/sawmill/stone-yard recipes.
   - Crafted buildings grant capabilities when owned/placed.

3. **Pickaxe Upgrade Progression**
   - Add tool tier state.
   - Add upgrade recipes.
   - Apply conservative yield/harvest modifiers.

4. **Resource Asset Generation Pass**
   - Generate and integrate the resource/farm/crafting assets.
   - Keep all generated assets aligned with the existing voxel/isometric
     style and transparent PNG processing pipeline.

## Decisions Needed

- Does `gold` remain only a crypto-mapped deposit reward, or become a separate
  local crafting material?
- Are home farm timers real elapsed time, epoch-bucketed, or action-count based?
- Should farm expansion use CKB, local resources, or both?
- Do crafted capability buildings need to be physically placed, merely owned,
  or both?
- Which pickaxe effects are safe before the economy pricing pass?

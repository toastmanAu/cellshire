# Economy Pricing Pass

Started May 23, 2026.

## Goals

- Keep the first epoch rewarding enough for visible progress.
- Let an engaged player complete roughly 2-3 first-tier upgrades after one
  normal mining/trading pass plus starter farm/resource harvesting.
- Keep CKB relevant for store, building, property, crafting, tool, bank, and
  treasury loops without making first-session upgrades feel stalled.
- Preserve a builder-game unlock pattern: breadth before height.

## Initial Tuning Decisions

- Trader fee increased from `0.75%` to `2%`.
- First utility building unlock costs were reduced so the first tier is
  resource-gated, not mostly CKB-gated:
  - `workbench` level 1: `6 Wood + 3 Stone + 2 Crop + 900 CKB`.
  - `tool_rack` level 1: `7 Wood + 4 Stone + 2 Crop + 1,000 CKB`.
  - `sawmill` level 1: `8 Wood + 4 Stone + 3 Crop + 1,200 CKB`.
  - `stone_yard` level 1: `5 Wood + 8 Stone + 3 Crop + 1,200 CKB`.
  - `farm_storage` level 1: `6 Wood + 4 Stone + 6 Crop + 1,100 CKB`.
- First tool upgrades were reduced to fit the same early-session reward target:
  - Reinforced Pickaxe: `6 Wood + 7 Stone + 3 Crop + 1,100 CKB`.
  - Reinforced Woodaxe: `7 Wood + 5 Stone + 3 Crop + 1,100 CKB`.
  - Reinforced Hoe: `5 Wood + 4 Stone + 7 Crop + 1,000 CKB`.
- Higher building tiers now require broad progression first. A building can
  advance to level `N` only after every standard building that supports level
  `N-1` has reached level `N-1`.

## Second Tuning Slice

- First-session pacing target: a focused player with `10,000 CKB`, `16 Wood`,
  `9 Stone`, and `6 Crop` can buy the first property expansion, one cheap store
  prop, unlock Tool Rack level 1, and upgrade one reinforced tool. This is now
  covered by `src/economy/economyPacing.test.js`.
- Local resource harvests increased to reduce early material stalls:
  - Wood nodes: `4 Wood` base yield.
  - Stone nodes: `3 Stone` base yield.
- Starter crops became a faster, more useful crop source:
  - Grow time: `12s`.
  - Harvest: `3 Crop`.
- Farm expansion costs now fit the boosted raw-material pacing:
  - Kitchen garden: `10 Wood + 7 Stone`.
  - Field patch: `28 Wood + 18 Stone`.
- First property expansion moved from `10,000 CKB` to `7,500 CKB`.
  Later tiers moved to `22,000 / 48,000 CKB` to preserve medium-term goals.
- Early store props were softened so a player can make a visible home change
  without delaying all progression:
  - Blue Railing: `350 CKB`.
  - Hay Bale: `500 CKB`.
  - Stone Lantern: `800 CKB`.
  - Tier-2 common props: `1,100-1,500 CKB`.
- Bank loans became more useful as bridge funding:
  - Fee: `2.5%`.
  - Offers: `7,500 / 18,000 / 42,000 CKB`.

## Current Non-Changes

- Epoch mine clear budget remains `$20-$100`.
- Bank loans keep the `$100` prototype base reserve so loans remain usable
  before treasury fee flow is mature.
- Higher tool tiers and higher building tiers remain intentionally chunky until
  playtesting shows whether the level-gate alone is enough pacing.

## Bank Fee Treasury Slice

- Paid bank loans now record their fee into the house treasury once per loan.
- The fee is converted from CKB to USD using the active price snapshot, matching
  the treasury's USD-denominated reserve view.
- Bank reserve already includes house treasury totals, so repaid loan fees now
  become visible future liquidity without removing the `$100` prototype base
  reserve.

## Early Resource Measurement Slice

- The runtime mine spawn picker now lives in `src/worldgen/spawnCell.js` so
  tests can measure from the same first-spawn rule as the playable build.
- `summarizeNearbyHarvestResources()` counts harvestable nodes adjacent to
  reachable walk cells within a step budget.
- Representative seeds within 36 steps currently provide:
  - `1337`: 12 Wood nodes, 3 Stone nodes, 2 Gold nodes.
  - `20260523`: 30 Wood nodes, 1 Stone node before guarantee.
  - `0xC011`: 36 Wood nodes, 20 Stone nodes, 6 Gold nodes.
- Procgen now adds missing `stone_outcrop` nodes after normal scatter to
  guarantee at least 2 reachable Stone nodes within 36 steps of the runtime
  first mine spawn. The sparse seed `20260523` receives 1 guaranteed Stone
  top-up, yielding 6 Stone within the early resource budget.

## Next Review

- Decide whether crop timers should be the primary first-tier limiter or
  whether starter farm output needs a small boost.
- Review whether a 2% trader fee creates enough house treasury visibility
  without making swaps feel punitive.
- Recheck first-session Stone spending after playtesting the new two-node
  near-spawn floor.

## Verification

- Browser test harness: `414 passed, 0 failed`.
- `node netlify-build.mjs`.
- `git diff --check`.

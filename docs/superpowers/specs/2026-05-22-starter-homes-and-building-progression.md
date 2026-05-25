# Starter Homes + Building Progression

Started May 22, 2026.

## Direction

Every user should begin with a baseline home building on their home plot. From
there, progression should be driven by a standard set of functional buildings.
The building itself unlocks capability; later markets can provide upgraded
skins, specialist variants, and tradable building assets without making the
base game dependent on market availability.

## Baseline Building Set

- `home`: default house, identity anchor, future rest/visit/home-management hub.
- `workbench`: basic crafting and recipe discovery.
- `tool_rack`: pickaxe/tool upgrades.
- `sawmill`: wood processing and timber recipes.
- `stone_yard`: stone processing and masonry recipes.
- `farm_storage`: crop/herb storage and farm efficiency.
- `bank_office` or `ledger_desk`: optional home-side treasury/loan extension
  after township bank mechanics settle.

## Progression Rules

- Baseline buildings are unlockable through gameplay resources plus CKB.
- Every paid building unlock or level upgrade must require Wood, Stone, Crop,
  and a designated CKB amount. This intentionally keeps trading, bank credit,
  and treasury-generating fee loops relevant to home-base progression.
- Each building has a functional level independent of its visual skin.
- Levels improve efficiency, capacity, recipe access, cooldowns, or automation.
- Building levels follow a builder-game tier gate: a building can advance to
  level `N` only after every standard building that supports level `N-1` has
  reached level `N-1`. Practically, level 2 upgrades require all standard
  buildings at level 1 first.
- Asset-market purchases can later override visuals or add specializations,
  but should not remove the standard local unlock path.
- Market assets should map onto building slots, e.g. a rare `workbench` skin
  attaches to the `workbench` capability rather than becoming a totally separate
  progression system.

## First Capability Effects

- `sawmill` levels add conservative bonus Wood per wood-resource harvest.
- `stone_yard` levels add conservative bonus Stone per stone-resource harvest.
- `farm_storage` levels add conservative bonus Crop per farm harvest.
- `workbench` and `tool_rack` expose their capability tiers for the next
  recipe/tool-upgrade pass but do not inflate crypto ore output yet.

## Asset Generation

- Starter homes now use the cleaned HiDream house as the active `house` sprite.
- Installed raw/game asset:
  `assets/raw/house.png` -> `assets/house.png`
- Generation scratch files remain local under `tmp/house-generation/`; the
  committed source of truth is the installed raw PNG.
- The cleaned version is warmer and more homely than the original reference
  house while keeping the gameplay `house` id stable for starter homes,
  store items, and future upgrade-slot mapping.

## Open Questions

- Should building levels be stored per owner globally, per placed building, or
  derived from owned cells/assets?
- Should market assets affect only visuals at first, or also add minor
  functional modifiers?
- Should home `house` upgrades gate property size, farm size, or purely home
  management features?
- What CKB/material cost curve keeps early unlocks reachable while making
  loans/trading materially useful?

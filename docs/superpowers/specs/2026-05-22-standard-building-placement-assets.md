# Standard Building Placement Assets

## Goal

Make the standard home-base building progression visible and placeable on the
player property with stable generated building assets.

## Shipped Scope

- Map each progression building to a stable asset id:
  - `home` -> `house`
  - `workbench` -> `workbench`
  - `tool_rack` -> `tool_rack`
  - `sawmill` -> `sawmill`
  - `stone_yard` -> `stone_yard`
  - `farm_storage` -> `farm_storage`
- Register the new building asset ids in the manifest with generated processed
  PNGs.
- Show unlocked standard building assets in the property palette.
- Allow unlocked standard buildings to be placed on the home plot without
  consuming prop inventory.
- Prevent erased standard buildings from minting tradeable prop inventory.
- Selected and installed generated assets:
  - `workbench` <- `workbench_c_sturdy`
  - `tool_rack` <- `tool_rack_b_wall`
  - `sawmill` <- `sawmill_c_logs`
  - `stone_yard` <- `stone_yard_c_crane`
  - `farm_storage` <- `farm_storage_c_harvest`

## Notes

- The asset ids, placement rules, and save semantics stayed stable when the
  generated PNGs replaced the temporary source sprites.
- Capability state is still driven by building progression level. Placement is a
  visible home-base layout layer, not a separate ownership requirement yet.
- Installed transparent preview sheet:
  `tmp/resource-asset-generation/building-candidates/installed/contact-sheet.png`.

## Verification

- Browser test harness: `285 passed, 0 failed`.
- `node netlify-build.mjs`.
- `git diff --check`.

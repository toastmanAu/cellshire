# Workbench Recipes + Tool Rack Upgrades

Started May 22, 2026.

## Direction

Use the newly unlocked `workbench` and `tool_rack` building levels to create
the first active crafting/tool loop. This should deepen the Wood/Stone/Crop/CKB
economy without inflating crypto ore rewards before the pricing pass.

## First Slice

- `workbench` level 1 unlocks `Herb Planter`.
- `workbench` level 1 unlocks `Stone Lantern Kit`.
- `workbench` level 1 unlocks `Storage Crate Kit`.
- `workbench` level 1 unlocks `Herbal Garden Kit`, consuming harvested Herb
  into a placeable garden bed.
- `workbench` level 2 unlocks `Prospecting Pan`.
- `workbench` level 2 unlocks `Stone Basin Kit`.
- `workbench` level 2 unlocks `Gold Lantern Kit`, consuming local Gold and
  Herb into a placeable hanging lantern.
- Recipe costs spend Wood, Stone, Crop, Herb, Gold, and CKB as tiers require.
- Recipe outputs can land in the existing local resource inventory or the prop
  inventory for placeable crafted items.
- `tool_rack` level 1 unlocks `Reinforced Pickaxe`.
- `tool_rack` level 2 unlocks `Steel Pickaxe`.
- Tool upgrades spend Wood, Stone, Crop, and CKB early, then add Herb and Gold
  requirements to higher tiers.
- Tool effects add conservative local Wood/Stone/Crop harvest bonuses only.

## Economy Notes

- Recipes intentionally include a CKB spend so players must mine/trade/borrow
  to progress beyond purely local materials.
- Tool upgrades stack with building effects for local resources, but not with
  crypto ore yield yet.
- Crypto ore modifiers need a separate pricing decision because they affect
  treasury fees, loan utility, and future mainnet/appchain sustainability.

## Open Questions

- Should crafted resources like Herb and Gold become cell-backed assets later?
- Should tool tiers affect action speed, node capacity, or only output amount?
- Which crafted placeables should become building modules rather than normal
  prop inventory items?

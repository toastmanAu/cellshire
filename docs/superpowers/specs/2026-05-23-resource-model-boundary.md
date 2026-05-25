# Resource Model Boundary

**Status:** implemented 2026-05-24

## Goal

Decide where the "raw harvest material" layer (Wood, Stone, Crop, Herb,
Gold material) ends and the "asset that can be owned, visited, traded"
layer begins. This is the on-chain boundary for the local resource and
crafting tracks added in the recent kanban cards
(`Resource Inventory + Wood/Stone Harvesting`, `Expandable Farm Zone MVP`,
`Workbench Recipes + Tool Rack Upgrades`).

## Non-goals

- Replacing the existing local resource inventory or harvest loop.
- A separate cell schema per material. Materials stay aggregated.
- Cross-player resource trading. Materials are not tradable.
- Visitor presence of raw resources. Visited homes show crafted props,
  not stockpiles.

## Decision

**Two-tier resource model:**

1. **Raw materials stay local-only.** Wood, Stone, Crop, Herb, and the
   local crafting `gold` material are high-frequency, low-value tokens
   that never become CKB cells.
2. **Crafted outputs cross the boundary.** When a recipe consumes
   materials and produces a placeable prop, tool, or skin, the output
   becomes a cell governed by the existing
   [`2026-05-20-open-asset-standard.md`](2026-05-20-open-asset-standard.md)
   schema (prop / character skin / accessory).

Reasons:

- Harvest is a per-second action; chain signing per harvest is hostile UX.
- Materials carry no individual identity worth preserving. Two units of
  Wood are interchangeable; no provenance audit is needed.
- Crafted props already have a cell representation through Open Asset
  Standard. The natural boundary is the recipe output, not the recipe
  input.
- Marketplace value lives in crafted goods, not raw piles. Mirroring
  Minecraft + economy game pattern: raw is ephemeral, crafted is durable.

## Material Catalog

The local resource catalog (authoritative in
`src/resources/resourceInventory.js`):

| Id | Name | Source | Role |
|---|---|---|---|
| `wood` | Wood | `harvest_tree` nodes | crafting + farm expansion |
| `stone` | Stone | `stone_outcrop` nodes | crafting + farm expansion |
| `crop` | Crop | farm plots | crafting + farm storage |
| `herb` | Herb | future farm/forage | crafting |
| `gold` | Gold (material) | `gold_nugget_node` resource node | high-tier tool crafting |

**Important disambiguation:**

The `gold` resource id (this catalog) is distinct from the `gold_ore`
mineable deposit (which maps to `btc` in the
[crypto economy](../../src/mining/cryptoEconomy.js) and becomes an sUDT
under the [currency spec](2026-05-23-currency-on-chain-sudt.md)).

- `gold_ore` → mined deposit → `btc` UDT (chain currency)
- `gold` → harvested resource node → local crafting material (no chain
  representation)

The two ids live in separate namespaces (`oreCatalog` vs `resourceCatalog`)
and must not be merged. Catalog tests should assert non-overlap.

## Why Not Cell-Back Materials

Considered but rejected:

| Option | Rejected because |
|---|---|
| sUDT per material | Forces JoyID signature on every harvest. Materials are sub-cent value; signing cost dominates |
| Single "MaterialPack" UDT with subtype tag | Loses simple per-material balance UX; trader/marketplace tooling expects one type per asset |
| Cell-back only when balance exceeds threshold | Phase-shift bugs at the threshold boundary; players hate "invisible" balance migration |
| Aggregate into "epoch summary cell" at epoch rollover | Couples material economy to epoch lifecycle; reload/disconnect during rollover loses data |

The signing-cost wall is the load-bearing reason. Once a Cellshire
session involves 50+ harvests in 10 minutes, anything other than
local-only is hostile.

## Crafted Output Cell Path

When a workbench recipe completes, the output already routes through
existing systems:

- Placeable prop output → Open Asset Standard cell (`cellshire.prop` or
  `cellshire.manifest-alias`). Property snapshot writer captures the
  placement.
- Tool output (pickaxe/woodaxe/hoe_scythe at higher tiers) → currently
  local-only owner-keyed tool tier state. Future: tool cell schema
  (separate follow-up; out of scope here).
- Skin output → Open Asset Standard character skin cell.

The recipe execution path stays local. The materials are debited from
the local resource inventory. The crafted output is added to the player's
inventory through the existing local-or-chain inventory adapter.

When a chain inventory adapter is active and the recipe output is a
cell-shaped asset, the adapter's `credit` writes a real cell. The recipe
implementation does not need to know which adapter is installed.

## Visitor Surface

Resource materials are **never** included in visitor views:

- Property snapshot writer
  ([`2026-05-21-property-snapshot-cell-writer.md`](2026-05-21-property-snapshot-cell-writer.md))
  does not serialize the resource inventory.
- Read-only visit mode does not query the resource inventory of the
  visited owner.
- Future presence features (Fiber-later) do not broadcast resource counts.

What visitors **do** see:

- Crafted props placed on the visited property (via Open Asset Standard
  cells).
- The visited property's farm zone tier + soil layout (already serialized
  by the snapshot writer).

This keeps the visitor surface coherent: "what is durable in your home
is what others see."

## Marketplace Eligibility

Materials are **not** marketplace-listable. The marketplace listing path
(currently local fixture) must validate that the listed asset is a
crafted prop, skin, or tool — not a raw material id.

If a player wants to "sell wood", they must first craft something with
it. This is intentional gameplay friction that funnels value through the
crafting system.

## Bank Loan Eligibility

Materials are **not** acceptable as loan collateral (relevant to the
[bank chain design spec](2026-05-23-bank-chain-design.md)). Collateral
must be a durable on-chain asset: property snapshot cell, crafted prop
cell, or sUDT balance.

## Farm Output Special Case

Farm plot crops produce a `crop` resource at harvest. This is local-only
by this spec. Farm storage upgrades (capacity tier) are reflected in the
property snapshot writer's tier field, not in a separate cell.

## Adapter Boundary

There is **no resource adapter**. The decision is final at the model
layer; resources are a local concept the game keeps in the
`ResourceInventory` class. No `LocalResourceAdapter`/`ChainResourceAdapter`
pair is introduced.

If a future feature requires resource visibility across players (e.g.
guild shared pools), it gets a new adapter and a new cell schema at that
point.

## Implementation Notes

This spec is mostly documentation — no new code is required for the
local resource path; it already exists. The implementation changes are:

| File | Change |
|---|---|
| `src/mining/oreCatalog.js` + `src/resources/resourceInventory.js` | Add a test asserting no shared ids between the two catalogs |
| `src/marketplace/marketplaceCatalog.js` (or equivalent) | Reject listings whose asset id resolves to `RESOURCE_CATALOG` |
| `src/bank/bankLoans.js` | Add collateral validator that rejects resource ids |
| `docs/DESIGN.md` | Link this spec under the resource/crafting section |

Implemented 2026-05-24:

- `src/mining/cryptoEconomy.test.js` asserts `RESOURCE_CATALOG` and
  `CURRENCY_CATALOG` ids stay disjoint.
- `src/marketplace/playerMarketplace.js` rejects raw resource listings with
  `raw-resource-not-listable` before consuming inventory.
- `src/bank/bankLoans.js` exports `validateBankCollateral(...)`, rejecting
  raw resource ids with `raw-resource-collateral`.

### Acceptance For The Documentation Slice

- A test in `cryptoEconomy.test.js` (or new `catalogDisjointness.test.js`)
  asserts `RESOURCE_CATALOG` ids and `CURRENCY_CATALOG` ids do not overlap.
- A test in the marketplace test file asserts a `wood` listing is
  rejected with a clear error.
- A test in the bank tests asserts a `stone` collateral entry is rejected.

Verified with browser test harness: `294 passed, 0 failed`.

## Open Questions

1. **Herb usage.** `herb` exists in the catalog but is not yet harvested
   anywhere in worldgen. Decide whether it gets a farm-side foraging
   loop, a forest spawn, or stays as a forward-looking placeholder.
2. **Gold material rarity.** `gold_nugget_node` placement frequency is
   not yet tuned. Decide whether it spawns in the public mine, the home
   farm, both, or only in higher-tier expansion plots.
3. **Crafting recipe persistence.** Whether unlocked recipes are
   reflected anywhere on chain (player progression cell) or stay purely
   local + derived from building levels. Likely the latter; flagged so
   the resume-state cell spec stays accurate.
4. **Material caps.** Whether the local resource inventory should have
   capacity caps tied to building levels (e.g. `farm_storage` raises
   crop cap). Currently uncapped; if caps are added, they're local-only.

## Acceptance Checklist

- Material vs crafted-output boundary is named.
- Rejected alternatives are documented with reasons.
- `gold` (material) vs `gold_ore` (mined currency) is explicit and the
  catalogs are asserted disjoint.
- Visitor surface, marketplace eligibility, and loan collateral
  eligibility are specified.
- No resource adapter is introduced; this is a final model decision.
- Implementation work scoped to test assertions + collateral validator.

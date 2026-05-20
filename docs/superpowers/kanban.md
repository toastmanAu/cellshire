# Cellshire Kanban

Status captured 2026-05-20. This board tracks the next implementation
cards needed to turn the current prototype into the game described in
`docs/DESIGN.md`.

## Current Baseline

- Playable isometric procgen map.
- Click-to-walk, pathfinding, collision, and click-to-interact mining.
- Local ore capacity, local inventory balances, mining FX/audio, and HUD.
- CKB epoch hash drives procgen seed with live/cached/random fallback.
- Per-epoch local mined-state persistence prevents reload double-mining.
- Epoch hash modifiers produce standard/high-yield/rich shifts that
  multiply mining yield and surface in the epoch HUD.
- Local-first property zone with a fenced starter claim, mine/home travel,
  bounded placement, starter owned-asset allow-list, and local persistence.
- Twelve mineable deposit visuals/catalog entries, including silver,
  lithium, bismuth, cobalt, and silicon quartz.
- Character picker, persisted character choice, starter character PNGs,
  and directional facing.
- Flux2 Kleingenerated Cellshire shield/logo integrated across the boot
  screen, title card, browser icon, touch icon, and JoyID app metadata.
- Build mode remains available via `?dev=1` for property-zone tooling.

## Done

### Character PNG Asset Pass

**Completed:** 2026-05-17

Added `assets/player_miner.png`, `assets/player_seeker.png`, and
`assets/player_tinker.png`. Browser smoke now serves the character
assets as `200`, and the picker tests still pass.

### Epoch Status UX

**Completed:** 2026-05-17

Added a non-debug epoch badge, cached/random fallback states, estimated
time-to-new-shift text, and a `New shift` reload action when the local
estimate says the epoch has rolled. Added pure tests for countdown and
status formatting.

### Wallet Identity Spike

**Completed:** 2026-05-17

Added a wallet/domain module, non-sensitive identity persistence, and a
JoyID-labeled connect/disconnect UI stub behind `?wallet=1`. Covered
disconnected, connecting, connected, and failed states with tests. Mining
and economy behavior remain independent of wallet state.

### On-Chain Mining Architecture Spec

**Completed:** 2026-05-17

Captured in
[`2026-05-17-on-chain-mining-design.md`](specs/2026-05-17-on-chain-mining-design.md).
The spec defines ore cell data, mine tx inputs/outputs, validation
rules, optimistic UX, stale-chain reconciliation, testnet-first feature
flags, and the first implementation slice.

### Mining Transaction Prototype

**Completed:** 2026-05-17

Added deterministic ore identity, tx-shaped ore/yield cell builders,
and a feature-flagged mining adapter boundary. `?chainMining=1` routes
`coal_seam` through a prototype JoyID/testnet-style adapter; unsupported
ores remain local. Failed/cancelled prototype submissions restore local
ore capacity and grant no yield.

### Real JoyID + CCC Mining Submit

**Completed:** 2026-05-17

Added optional `?wallet=joyid` / `?chainMiningSubmit=ccc` runtime wiring
for CCC-backed JoyID connection and CKB testnet mining submit. The real
path loads `@ckb-ccc/ccc` from an ESM CDN, prepares a CCC transaction
with a compact Cellshire mining receipt witness, signs/submits through
JoyID, and preserves the prototype/local adapters for offline dev. Failed
signature or submit still bubbles through the mining adapter failure path,
so local ore capacity is restored before yield is granted.

### Epoch Modifier + High-Value Epochs

**Completed:** 2026-05-17

Added deterministic epoch modifier bucketing from the epoch hash, high-value
HUD state/toast, and multiplier-aware ore yield. Documented the 5% `3x` /
20% `2x` tuning constants in `docs/DESIGN.md`.

### Property Zone MVP

**Completed:** 2026-05-18

Added a home/property map reachable from the mine through the property HUD
or mine-side signpost. The starter claim is fenced, uses the existing
placement toolbar/palette with a starter owned-asset allow-list, rejects
placement outside the editable bounds, and autosaves locally through a
property-specific storage key. Chain-backed placed prop cells remain a
later integration.

### HUD Layout + Cellshire Polish

**Completed:** 2026-05-18

Reworked the desktop HUD stack: inventory bottom-right, time/toggles
top-right, epoch top-middle, map label under time, and debug overlay under
the Cellshire title block. Replaced first-load Mykonos copy with Cellshire
language. Fixed play-mode desktop clicks so walking/mining are not consumed
by builder brush input, added visible walk bob and mining hit pulse, and
added contextual cursors for walk, mining, POI, build, erase, pan, and
blocked states.

### Mineable Asset Expansion

**Completed:** 2026-05-18

Generated and integrated five new mineable deposit blocks: `silver_ore`,
`lithium_ore`, `bismuth_ore`, `cobalt_ore`, and `silicon_quartz`. The game
now has 12 mineable catalog entries, procgen includes the new deposits, and
tests assert the mineable set.

### Crypto Ore Economy Mapping

**Completed:** 2026-05-18

Mapped all 12 mineable deposits to proof-of-work internal currencies:
BTC, LTC, DOGE, DASH, XMR, ZEC, CKB, KAS, ERG, BCH, DGB, and RVN. Mining now
credits crypto currency IDs instead of ore asset IDs, inventory displays
crypto labels/symbols, and mined amounts are value-normalized through the
fixed CoinGecko testnet price snapshot captured on 2026-05-18 at 14:06:32 UTC.

### Epoch Price Snapshot Adapter

**Completed:** 2026-05-18

Added a CoinGecko price adapter with live, cached, and fixed fallback modes.
Boot now fetches/caches one price snapshot alongside the epoch procgen seed,
the debug overlay surfaces snapshot source/time, and each spawned mineable
receives a deterministic `$50-$200` USD value budget that is converted into
the mapped crypto quantity as it is mined.

### Epoch-Deterministic Ore Value Bands

**Completed:** 2026-05-19

Added a two-word epoch hash value-band derivation. Each epoch now rolls a
lower bound from `$1-$100` and a spread from `$20-$200`, allowing lean
`$1-$21` epochs through rich `$100-$300` epochs. Individual mineables still
roll deterministically inside the epoch band, so all players see the same
ore values for the same epoch/world seed.

### Cellshire Brand Logo Integration

**Completed:** 2026-05-20

Promoted the final `cs_logo.png` into the served `assets/cellshire_logo.png`
slot, bumped the browser cache key, added favicon and Apple touch icon links,
and switched the CCC/JoyID default app logo from the miner sprite to the
Cellshire brand mark. Verified with the browser test harness
(`151 passed, 0 failed`) and `node netlify-build.mjs`.

### Economy HUD + Token Detail

**Completed:** 2026-05-20

**Goal:** make the crypto economy legible to players while keeping the
current HUD compact.

Added currency logo marks, symbol/name rows, approximate USD balances, and a
recent-hit detail line for the compact economy HUD. Added a disclosure for
price snapshot mode/source/capture metadata. Added a `?dev=1` ore budget debug
panel that lists every live ore's remaining/total USD budget, cell, capacity,
and mapped currency. The balance model still uses internal currency IDs so the
local path remains compatible with a later Nervos UDT-backed inventory adapter.

Verified with the browser test harness (`155 passed, 0 failed`), a dev-mode
headless page load, and `node netlify-build.mjs`.

### Property Expansion Tiers

**Completed:** 2026-05-20

**Goal:** make the property zone grow through gameplay.

Added four tested claim tiers that expand the editable property bounds from
the starter `16x16` claim up to a `22x22` max claim. The property HUD now
shows the current tier, next expansion cost, and an unlock action while at
home. Unlocking spends local CKB from the existing inventory model, refreshes
the property-mode canvas preview overlay, and autosaves the unlocked tier with
the property snapshot for the future resume-state path. Existing starter
fences remain placeable/erasable objects once they fall inside an unlocked
claim.

Verified with the browser test harness (`162 passed, 0 failed`) and
`node netlify-build.mjs`.

### Resume State Cell Spec

**Completed:** 2026-05-20

**Goal:** turn save/load into the designed one-cell resume snapshot.

Captured in
[`2026-05-20-resume-state-cell-spec.md`](specs/2026-05-20-resume-state-cell-spec.md).
The spec defines the resume-state boundary, logical and compact v1 blob
shapes, validation rules, local-to-chain migration, prompt and pending-save
badge behavior, load UX, adapter boundaries, and the first implementation
slice. Decision: use a custom minimum-capacity Cellshire resume state cell for
v1; keep CKBFS V3 for larger player-authored files/exported blueprints.

### Multiple Map Travel

**Completed:** 2026-05-20

**Goal:** support mine/property/region transitions without one huge world.

Added a tested map registry with deterministic ids, display names, seed
sources, and entry spawns. Public mine maps are keyed by epoch
(`mine:<epoch>` with `mine:local` fallback); property maps are keyed by player
owner (`property:<owner>`, currently `property:local`). Portal roles now resolve
through the registry, and the game captures/restores map runtime by map id so
mine/property travel preserves camera, player position, epoch state, ore state,
and property tier. The registry tests cover deterministic map selection, role
targets, and spawn fallback.

Verified with the browser test harness (`166 passed, 0 failed`) and
`node netlify-build.mjs`.

### Trader Store MVP

**Completed:** 2026-05-20

**Goal:** make mined ore balances useful before full marketplace work.

Added a local Trader HUD that quotes deterministic currency swaps from the
active/fixed price snapshot with a trader fee. Players can choose source and
target proof-of-work currencies, use a Max affordance against local balances,
preview the quote/rate, and swap through the local inventory model. The rate
table and quote math live in a tested trader module, and the local swap path
sits behind a trader adapter with an explicit future Cellswap boundary.

Verified with the browser test harness (`174 passed, 0 failed`), a headless
app smoke load, and `node netlify-build.mjs`.

### General Store

**Completed:** 2026-05-20

**Goal:** sell common props at fixed game-set prices.

Added a fixed General Store catalog with placeable props, CKB prices, rarity,
and property-tier unlocks. Purchases spend local CKB and add instances to a
persisted local prop inventory. Bought non-starter props become visible in the
property palette, placement consumes one owned instance, and erasing a bought
prop returns it to inventory. The local path is documented against the future
chain vendor-script flow in
[`2026-05-20-general-store-vendor-script.md`](specs/2026-05-20-general-store-vendor-script.md).

Verified with the browser test harness (`182 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks for the new HUD/Game
wiring.

### Player Marketplace

**Completed:** 2026-05-20

**Goal:** support unique player-listed items.

Added a local-first marketplace model for unique prop/skin listing cells,
including seed listings for offline browsing, player-created prop listings,
buy, and cancel flows. Listing player props consumes one owned prop instance;
cancel returns it; buying spends local CKB and adds the purchased prop or skin
to local marketplace state. The Marketplace HUD stays browse-only when no
wallet identity is connected, and the live Cellswap/Spore settlement path is
documented in
[`2026-05-20-player-marketplace-cellswap-spore.md`](specs/2026-05-20-player-marketplace-cellswap-spore.md).

Verified with the browser test harness (`187 passed, 0 failed`),
`node netlify-build.mjs`, marketplace module import checks, and a headless
app smoke load confirming the browse-only Market HUD mounts cleanly.

### Open Asset Standard

**Completed:** 2026-05-20

**Goal:** let community-minted assets appear in game.

Captured the v1 schema draft in
[`2026-05-20-open-asset-standard.md`](specs/2026-05-20-open-asset-standard.md),
covering ground tile, prop, character skin, and accessory cells. Added a
`cellshire.manifest-alias` render rule that maps compliant cell metadata to
existing renderer sources while preserving a generated `open:<cell id>` runtime
asset id. Placement, property bounds, palette visibility, renderer preview,
and marketplace validation now resolve assets through a registry that includes
dynamic open definitions. The browser fixture registers a Spore-like prop cell
and places it as an in-game prop without adding its id to the static catalog.

Verified with the browser test harness (`190 passed, 0 failed`),
`node netlify-build.mjs`, open-asset module import checks, and a headless app
smoke load.

## Next

### Chain Inventory Read Model

**Goal:** replace local inventory balances with wallet-owned cells.

**Acceptance:**
- Read player currency/item cells through a single inventory adapter.
- HUD can render local-dev inventory or chain inventory through the same interface.
- Reconciliation handles pending txs and stale indexer reads.
- Local inventory tests stay valid through adapter fixtures.

## Later

### Visiting + Presence

**Goal:** let other players see property zones and eventually each other.

**Acceptance:**
- Read-only visit route for a property zone by owner id.
- Visitor cannot mutate owner props.
- Presence transport options documented; Fiber remains the likely later path.
- Snapshot view ships before real-time movement sync.

## Needs Decision

- Property topology: dedicated own-map vs subregion of a shared map.
- First on-chain mining path: real testnet cells vs mock/indexed dev cells.
- Currency model: sUDT per ore, custom typed cells, or hybrid.
- Epoch modifier algorithm and high-value epoch frequency.
- Store integration order: Trader first, General Store first, or wallet inventory first.
- Save-state storage: CKBFS V3 vs custom minimum-capacity state cell.

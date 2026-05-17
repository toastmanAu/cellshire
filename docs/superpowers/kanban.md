# Cellshire Kanban

Status captured 2026-05-17. This board tracks the next implementation
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
- Character picker, persisted character choice, starter character PNGs,
  and directional facing.
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

## Next

### Property Zone MVP

**Goal:** give each player a home/base map distinct from the public mine.

**Acceptance:**
- Add a property-zone mode/map reachable from the mine.
- Initial fenced zone has bounded editable cells and uses existing placement tools.
- Only owned/allowed props can be placed in play mode.
- Local persistence exists first; chain-backed placed prop cells come later.

## Soon

### Property Expansion Tiers

**Goal:** make the property zone grow through gameplay.

**Acceptance:**
- Define tier sizes, prices, and max bounds.
- UI previews locked/unlocked expansion cells.
- Spending local currency unlocks the next tier.
- Expansion state is stored in the same resume-state model planned for chain save.

### Resume State Cell Spec

**Goal:** turn save/load into the designed one-cell resume snapshot.

**Acceptance:**
- Specify compact state blob: current map, camera, selected character, UI prefs, property tier.
- Define migration/version rules for old blobs.
- Define save prompts and pending-save badge behavior.
- Decide CKBFS V3 vs custom state cell for first implementation.

### Multiple Map Travel

**Goal:** support mine/property/region transitions without one huge world.

**Acceptance:**
- Add map registry with ids, names, seed source, and entry spawn.
- Portal/lift/ferry interaction switches maps and restores camera/spawn.
- Mining map remains epoch-derived; property map remains player-derived.
- Tests cover deterministic map selection and spawn fallback.

### Trader Store MVP

**Goal:** make mined ore balances useful before full marketplace work.

**Acceptance:**
- Add Trader UI with deterministic exchange rates.
- Swap local balances between ore currencies.
- Rate table lives in one tested module.
- Later Cellswap integration has a clear adapter boundary.

## Later

### General Store

**Goal:** sell common props at fixed game-set prices.

**Acceptance:**
- Fixed catalog of placeable props, price, rarity, and unlock tier.
- Buy action adds owned prop inventory.
- Property placement consumes owned prop instances when appropriate.
- Chain vendor-script path documented for the live version.

### Player Marketplace

**Goal:** support unique player-listed items.

**Acceptance:**
- Listing model for unique prop/skin cells.
- Browse, buy, cancel listing flows.
- Cellswap/Spore integration design documented before implementation.
- Marketplace remains read-only/offline-safe when wallet is disconnected.

### Open Asset Standard

**Goal:** let community-minted assets appear in game.

**Acceptance:**
- Molecule schema draft for ground tiles, props, character skins, and accessories.
- Render-rule format maps cell metadata to existing asset/renderer paths.
- Compatibility/versioning rules documented.
- Test fixture cell renders as an in-game prop without hardcoded asset id.

### Chain Inventory Read Model

**Goal:** replace local inventory balances with wallet-owned cells.

**Acceptance:**
- Read player currency/item cells through a single inventory adapter.
- HUD can render local-dev inventory or chain inventory through the same interface.
- Reconciliation handles pending txs and stale indexer reads.
- Local inventory tests stay valid through adapter fixtures.

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

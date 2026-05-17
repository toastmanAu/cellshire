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

## Next

### On-Chain Mining Architecture Spec

**Goal:** define the exact cell model before coding transaction paths.

**Acceptance:**
- Specify ore cell data: ore type, map id/epoch, position, capacity remaining.
- Specify mine tx: inputs, outputs, capacity decrement/depletion, yield credit.
- Decide whether the first live version uses testnet cells, mock cells, or a local dev index.
- Document reconciliation between optimistic local mining and chain truth.

### Mining Transaction Prototype

**Goal:** replace local-only mining for one ore type with a signed testnet
transaction path.

**Acceptance:**
- Player can connect wallet, mine a supported ore, sign a tx, and see success/failure.
- Local `OreState` updates only optimistically and reconciles after tx result.
- Failed/cancelled signatures leave ore capacity unchanged.
- Existing local mode remains available for dev and offline fallback.

### Epoch Modifier + High-Value Epochs

**Goal:** turn epoch hashes into variable mining yield.

**Acceptance:**
- Deterministic `epochModifier(hash)` function with tests.
- High-value epoch predicate with visible HUD/banner state.
- Ore yield ranges multiply by modifier without breaking local tests.
- Design doc records the chosen algorithm and tuning constants.

## Soon

### Property Zone MVP

**Goal:** give each player a home/base map distinct from the public mine.

**Acceptance:**
- Add a property-zone mode/map reachable from the mine.
- Initial fenced zone has bounded editable cells and uses existing placement tools.
- Only owned/allowed props can be placed in play mode.
- Local persistence exists first; chain-backed placed prop cells come later.

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

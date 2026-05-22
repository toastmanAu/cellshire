# Cellshire Kanban

Status captured 2026-05-22. This board tracks the next implementation
cards needed to turn the current prototype into the game described in
`docs/DESIGN.md`.

## Session Wrap 2026-05-22

- Completed chain visit fixture compatibility, the first communal township
  plane, RPG-style building interior windows, and local house treasury fee
  accounting, a local Bank loan prototype, expandable home farming, and the
  cleaned HiDream starter-home asset integration, the first home building
  unlock/effects pass, and Workbench recipe plus Tool Rack upgrade loops.
- Latest completed card: `Workbench Recipes + Tool Rack Upgrades`.
- Current Next card: `Resource Asset Generation Pass`.
- Known local-only files: untracked `cs_logo.png` and `tmp/`.
- Last verification: browser harness `285 passed, 0 failed` and
  `node netlify-build.mjs`.

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
- Starter property maps now include a baseline `house` plus the reserved farm
  soil footprint, using the cleaned HiDream house sprite.
- Communal township map reachable by signposts from the mine and starter
  property, with Store, Market, Bank, Gallery, and Community Hall hotspots.
- Township landmark interactions open stylized interior windows that route into
  Store, Market, and exchange flows or show future-only building actions.
- Trader swap fees are recorded into a local house treasury visible from the
  Bank interior window.
- Bank loans can issue and repay local CKB credit from the Bank interior, with
  tunable offer/fee/reserve constants.
- Farming/resource/crafting progression is specified, including home farm
  expansion, epoch-refreshing trees/stone, crafting buildings, and pickaxe
  upgrade direction.
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

### Chain Inventory Read Model

**Completed:** 2026-05-20

**Goal:** replace local inventory balances with wallet-owned cells.

Added a local/chain inventory adapter boundary that normalizes currency, prop,
and skin cells into the existing inventory interfaces. The chain snapshot path
filters stale indexer cells by `minBlockNumber`, applies pending transaction
deltas, and reports stale cells for reconciliation UX. The Economy HUD now reads
through an adapter snapshot while preserving the local player inventory path.
The read-model contract is documented in
[`2026-05-20-chain-inventory-read-model.md`](specs/2026-05-20-chain-inventory-read-model.md).

Verified with the browser test harness (`196 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Visiting + Presence

**Completed:** 2026-05-20

**Goal:** let other players see property zones and eventually each other.

Added `?visit=<owner id>` as a read-only property snapshot route. Property
storage now supports owner-keyed local snapshots while preserving the existing
`local` key, and map registry entries carry owner/read-only metadata. Visit
mode lets the local avatar walk around the loaded property but blocks place,
erase, save, reset, expand, and autosave paths. The toolbar/palette are hidden
for visitors, and the property HUD labels the inspected owner. Presence options
and the Fiber-later recommendation are captured in
[`2026-05-20-visiting-presence.md`](specs/2026-05-20-visiting-presence.md).

Verified with the browser test harness (`200 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Chain Property Snapshot Adapter

**Completed:** 2026-05-20

**Goal:** load visited property snapshots from indexed owner cells.

Added a property snapshot adapter boundary with local and chain/indexer
implementations. The chain adapter normalizes `cellshire.property.snapshot` v1
cells into the same snapshot shape returned by local storage, chooses the
newest owner cell, reports stale cells below `visitMinBlock`, and leaves the
visit route in a clear read-only starter/pending state when no current snapshot
is indexed. `?visitSource=chain` now routes visits through the chain adapter;
the default remains local owner-keyed storage. The fixture/indexer contract is
documented in
[`2026-05-20-chain-property-snapshot-adapter.md`](specs/2026-05-20-chain-property-snapshot-adapter.md).

Verified with the browser test harness (`205 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Shareable Visit Links

**Completed:** 2026-05-20

**Goal:** make property visits discoverable from wallet identity.

Added a visit-link formatter and property HUD share action. Links include the
current property owner id and selected snapshot source (`local` or `chain`),
strip session/editor params, and preserve useful context such as fixed prices.
Local/disconnected property mode shares a local preview link, while visited or
future wallet-owned properties share their loaded owner id. Clipboard copy uses
the browser clipboard API when available and falls back to showing the URL in
the toast. The link contract is documented in
[`2026-05-20-shareable-visit-links.md`](specs/2026-05-20-shareable-visit-links.md).

Verified with the browser test harness (`209 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Wallet Owner Property Binding

**Completed:** 2026-05-20

**Goal:** bind home ownership to connected wallet identity.

Added a separate owner-binding preference so a connected wallet can explicitly
switch the home property owner from `local` to the wallet address. The Wallet
HUD now exposes `Use wallet home` / `Use local home`, and disconnecting returns
the live owner to local mode without deleting either local or owner-keyed
property saves. Startup applies the wallet owner when wallet features are
enabled, a persisted wallet is connected, and the binding mode is wallet.
`Game.setHomePropertyOwner()` autosaves the current editable property before
switching owners, so share links and the property portal target the selected
owner id. The binding contract is documented in
[`2026-05-20-wallet-owner-property-binding.md`](specs/2026-05-20-wallet-owner-property-binding.md).

Verified with the browser test harness (`214 passed, 0 failed`),
`node netlify-build.mjs`, module import checks, and a headless wallet-mode boot
smoke.

### Property Snapshot Cell Writer

**Completed:** 2026-05-21

**Goal:** write wallet-owned property snapshots into chain-shaped cells.

Added a snapshot writer boundary for wallet-owned homes. The new payload builder
exports `cellshire.property.snapshot` v1 data with owner, tier, tile map,
camera, schema, and version fields. The local fixture writer stores owner-keyed
snapshot cells under `cellshire:property-snapshot-cells:v1:<owner>`, matching
the existing chain read adapter. Writes are gated behind a connected wallet
whose address matches the editable property owner. `Game.save()` and property
autosave now use a shared local-save-plus-snapshot helper, so local property
storage still succeeds when the wallet writer is unavailable, disconnected, or
owner-mismatched. The contract is documented in
[`2026-05-21-property-snapshot-cell-writer.md`](specs/2026-05-21-property-snapshot-cell-writer.md).

Verified with the browser test harness (`218 passed, 0 failed`),
`node netlify-build.mjs`, and module import checks.

### Property Snapshot Submit Adapter

**Completed:** 2026-05-21

**Goal:** turn wallet-owned property snapshots into wallet-submitted CKB transactions.

Added a logical property snapshot transaction request builder and a submit
adapter for wallet-owned property snapshots. The default writer remains the
local fixture writer; `?propertySnapshotSubmit=ccc` or
`?propertySnapshotReal=1` switches saves to the CCC/JoyID submit adapter. The
adapter preserves the existing wallet-owner gate, maps snapshots into
`cellshire_property_snapshot_tx` requests, and reports normalized submit
failures while keeping the local property save successful. CCC/JoyID now has a
property snapshot receipt payload and transaction builder that mirrors the
mining submit path. The flow is documented in
[`2026-05-21-property-snapshot-submit-adapter.md`](specs/2026-05-21-property-snapshot-submit-adapter.md).

Verified with the browser test harness (`227 passed, 0 failed`),
`node netlify-build.mjs`, module import checks, and a headless
`?propertySnapshotSubmit=ccc` boot smoke.

### Property Snapshot Save Status

**Completed:** 2026-05-21

**Goal:** surface local/snapshot publish status after property saves.

Added a shared formatter for combined local-save and snapshot-write results.
Explicit property saves now await the snapshot writer and show precise toast
messages such as `Saved local + visit snapshot`, `Saved local + published
snapshot`, or `Saved local; not enough CKB to publish`. Autosave still runs the
same helper without toast noise, records the latest result on the game, and
emits map state for HUD/debug consumers. The Property HUD appends the compact
save label to editable home details after a save status exists. The behavior is
documented in
[`2026-05-21-property-snapshot-save-status.md`](specs/2026-05-21-property-snapshot-save-status.md).

Verified with the browser test harness (`228 passed, 0 failed`),
`node netlify-build.mjs`, module import checks, and a headless
`?propertySnapshotSubmit=ccc` boot smoke.

### Chain Visit Smoke Fixtures

**Completed:** 2026-05-21

**Goal:** prove wallet-owned snapshot saves can be visited through the chain snapshot read path.

Added integration coverage that saves a wallet-owned property through the local
fixture snapshot writer, then reads it back through
`?visit=<owner>&visitSource=chain` via the same adapter factory the app uses.
Missing owner and `visitMinBlock` stale fallback behavior are covered. The
manual smoke flow is documented in
[`2026-05-21-chain-visit-smoke-fixtures.md`](specs/2026-05-21-chain-visit-smoke-fixtures.md).

**Acceptance:**
- Saving a wallet-owned fixture snapshot produces a visit-readable chain source fixture.
- A `?visit=<owner>&visitSource=chain` smoke loads the saved snapshot owner.
- Tests cover writer-to-reader compatibility and missing/stale fallback behavior.
- Docs capture the local fixture flow for manual testing.

Verified with the browser test harness (`230 passed, 0 failed`) and
`node netlify-build.mjs`.

### Communal Township Plane

**Completed:** 2026-05-21

**Goal:** create a shared township map that acts as the social/economic hub
outside the mine and private property planes.

Added `township:communal` as a third map kind alongside mine and property.
Mine boot now places a township signpost near the spawn, starter properties
include a township signpost, and the township has exits back to the mine and
active property. The deterministic `32x32` township map includes landmark
hotspots for Store, Market, Bank, Gallery, and Community Hall. Landmark
interactions currently show a lightweight coming-soon toast so the next card
can replace them with RPG-style interior windows. The flow is documented in
[`2026-05-21-communal-township-plane.md`](specs/2026-05-21-communal-township-plane.md).

**Acceptance:**
- Map registry includes a deterministic township entry and spawn.
- Mine/property HUD or signpost travel can enter and leave the township.
- Township buildings expose interaction hotspots without opening the current
  HUD panels automatically.
- Smoke test confirms township travel preserves mine/property runtime state.

Verified with the browser test harness (`233 passed, 0 failed`) and
`node netlify-build.mjs`.

### RPG Building Interior Windows

**Completed:** 2026-05-21

**Goal:** make township buildings feel like old-school RPG storefronts instead
of plain overlay panels.

Added a shared building interior window for township landmarks. The window
renders scene-specific Store, Market, Bank, Gallery, and Community Hall rooms,
supports click-away/close-button/`Escape` dismissal, and returns focus to the
game canvas. Store, Market, and Bank exchange actions open the existing Store,
Marketplace, and Trader panels through small public HUD handles; future-only
loan, gallery, and hall actions stay in the room and show scoped toasts. The
flow is documented in
[`2026-05-21-rpg-building-interior-windows.md`](specs/2026-05-21-rpg-building-interior-windows.md).

**Acceptance:**
- Building interaction opens a building-specific scene window.
- Store and Market scene options can launch the existing Shop/Market flows.
- Keyboard/mouse close behavior returns focus to township movement.
- Scene window assets and actions are data-driven enough to add Bank, Gallery,
  and Community Hall without bespoke UI code for each building.

Verified with the browser test harness (`236 passed, 0 failed`) and
`node netlify-build.mjs`.

### Game House Treasury

**Completed:** 2026-05-21

**Goal:** route economy fees into an explicit game/house treasury that can fund
later economic loops.

Added a local house treasury ledger at `cellshire:house-treasury:v1`. Successful
Trader swaps now record USD-denominated fee entries with source currency,
amount, target currency, fee bps, timestamp, and swap mode context. The Bank
interior window shows a compact treasury summary and a `House treasury` action
with recent fee records. The local design keeps source currency context so a
future chain treasury can settle as CKB, UDT balances, typed cells, or a hybrid.
The flow is documented in
[`2026-05-21-game-house-treasury.md`](specs/2026-05-21-game-house-treasury.md).

**Acceptance:**
- Trader fee accounting records fee source, currency, amount, and timestamp.
- Treasury balance is inspectable in dev mode or a Bank/Community Hall view.
- Existing trade quote math still clearly shows the player-facing fee.
- Tests cover fee accumulation and no-fee/local fallback behavior.

Verified with the browser test harness (`241 passed, 0 failed`) and
`node netlify-build.mjs`.

### Bank + Loan Economy

**Completed:** 2026-05-21

**Goal:** explore a SimCity-like bank that turns house treasury liquidity into
player-facing loans and longer-term economic pressure.

Added a local loan book at `cellshire:bank-loans:v1:local` with one active CKB
loan at a time. The Bank `Loan office` now shows tunable offers, borrow actions,
the current remaining debt, and a repay-balance action. Loan availability uses a
prototype base reserve plus house treasury fees minus active principal; pricing
constants live in `src/bank/bankLoans.js` so item/store/expansion pricing can
move later without changing the UI flow. The flow is documented in
[`2026-05-21-bank-loan-economy.md`](specs/2026-05-21-bank-loan-economy.md).

**Acceptance:**
- Spec defines loan terms, repayment cadence, interest/fee model, default
  handling, and whether collateral is required.
- Spec defines how house treasury funds loan reserves and receives repayments.
- Spec identifies what must remain local-only for prototype safety.
- Prototype lending UI stays local-only with no wallet-backed debt cells yet.

Verified with the browser test harness (`247 passed, 0 failed`) and
`node netlify-build.mjs`.

### Resource Inventory + Wood/Stone Harvesting

**Goal:** add local gameplay resources and epoch-refreshing harvest nodes before
full farming/crafting.

**Spec:** [`2026-05-21-resource-inventory-wood-stone-harvesting.md`](specs/2026-05-21-resource-inventory-wood-stone-harvesting.md)

**Status:** shipped local material inventory plus epoch-refreshing wood/stone
harvest nodes.

**Notes:**
- Added persistent local resource inventory and compact Resources HUD.
- Tagged procgen trees as wood resources and added stone resource outcrops.
- Harvesting walks adjacent, grants `wood`/`stone`, and locally depletes the
  node using the existing epoch mined-state path.
- Covered resource catalog, inventory persistence, walkability, HUD rendering,
  and procgen placement with tests.

Verified with the browser test harness (`256 passed, 0 failed`) and
`node netlify-build.mjs`.

### Expandable Farm Zone MVP

**Goal:** add a farmable home-base area that expands independently from the
decorative property claim.

**Spec:** [`2026-05-21-expandable-farm-zone-mvp.md`](specs/2026-05-21-expandable-farm-zone-mvp.md)

**Status:** shipped the local farm-zone MVP.

**Notes:**
- Added owner-keyed farm state with persistent tier and planted crop timers.
- Home maps now reserve visible farm soil and draw an expandable farm overlay.
- Farm tier expansion spends local `wood` and `stone`.
- Pan-mode farm clicks plant starter crops; planted crops are interactable and
  harvest into the local resource inventory as `crop`.
- Decorative placement and erase operations do not overwrite active farm land.

Verified with the browser test harness (`262 passed, 0 failed`) and
`node netlify-build.mjs`.

### Starter Home Visual Integration

**Completed:** 2026-05-22

**Goal:** make every new player home feel warmer and more personal while
keeping the baseline `house` gameplay slot stable.

**Spec:** [`2026-05-22-starter-homes-and-building-progression.md`](specs/2026-05-22-starter-homes-and-building-progression.md)

**Status:** shipped the cleaned HiDream house as the active `house` sprite.

**Notes:**
- Replaced `assets/raw/house.png` and processed `assets/house.png`.
- Starter homes still use the existing `house` asset id, so store/catalog,
  placement, starter ownership, and future upgrade-slot logic stay stable.
- Kept the original gameplay footprint at 2x2 for now; functional home levels
  and market skins remain part of the next building progression pass.

Verified with the browser test harness (`262 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Crafting Building Unlocks

**Completed:** 2026-05-22

**Status:** shipped the building state, mixed material/CKB costs, Buildings HUD,
and first resource-yield effects.

**Goal:** let home-base buildings unlock useful capabilities.

**Spec:** [`2026-05-22-starter-homes-and-building-progression.md`](specs/2026-05-22-starter-homes-and-building-progression.md)

**Acceptance:**
- Every user starts with a baseline `home` building on their home plot.
- Add a standard local building set: `home`, `workbench`, `tool_rack`,
  `sawmill`, `stone_yard`, and `farm_storage`.
- Building unlocks and upgrades consume Wood, Stone, Crop, and a designated
  CKB amount so trading, loans, and treasury fee generation remain tied into
  home-base progression.
- Each building has an independent functional level for efficiency, capacity,
  recipe access, cooldowns, or automation.
- Future asset-market purchases attach as skins, variants, or specialist
  modules to standard building slots instead of replacing the baseline
  progression path.
- Capability state derives from owned/unlocked/placed standard buildings, not
  only from decorative props.
- First capability effects keep crypto ore rewards untouched: `sawmill`
  improves Wood harvests, `stone_yard` improves Stone harvests, and
  `farm_storage` improves Crop harvests.

Verified with the browser test harness (`269 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

### Workbench Recipes + Tool Rack Upgrades

**Completed:** 2026-05-22

**Status:** shipped recipe catalog, crafted prop outputs, owner-keyed
resource-specific tool tier state, local harvest modifiers, and Home Buildings
panel actions.

**Goal:** turn the newly unlocked `workbench` and `tool_rack` capability tiers
into player-facing crafting and tool progression.

**Spec:** [`2026-05-22-workbench-recipes-tool-rack-upgrades.md`](specs/2026-05-22-workbench-recipes-tool-rack-upgrades.md)

**Tool family spec:** [`2026-05-22-tool-family-progression.md`](specs/2026-05-22-tool-family-progression.md)

**Acceptance:**
- Add a small recipe catalog gated by `workbench` level.
- Add local pickaxe/tool tier state gated by `tool_rack` level.
- Recipes consume Wood, Stone, Crop, and CKB where they affect the economy.
- Tool upgrades apply conservative local-resource harvest modifiers first;
  crypto ore changes stay behind an explicit pricing decision.
- Home Buildings panel links clearly to the recipe/tool actions.

**Notes:**
- Workbench recipes currently craft local resources plus placeable `crate`,
  `stone_lantern`, and `stone_basin` props.
- Tool tiers currently add local Wood/Stone/Crop harvest bonuses only.
- Tool progression is now split into `pickaxe` for Stone, `woodaxe` for Wood,
  and `hoe_scythe` for Crop. Each line upgrades independently through the Tool
  Rack and old single-tier saves migrate across all three lines.

Verified with the browser test harness (`283 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

## Next

### Resource Asset Generation Pass

**Status:** in progress; first gameplay-facing asset wiring shipped.

**Goal:** generate and integrate farming/resource/crafting assets using
ComfyUI/Wyltek Studio models.

**Spec:** [`2026-05-22-standard-building-placement-assets.md`](specs/2026-05-22-standard-building-placement-assets.md)

**Prompt sheet:** [`2026-05-22-flux-asset-comparison-prompts.md`](specs/2026-05-22-flux-asset-comparison-prompts.md)

**Acceptance:**
- Generate harvestable tree, stone resource, optional gold material node, farm
  plot states, workbench, tool rack, sawmill, stone yard, farm storage, and
  pickaxe upgrade visuals.
- Use reference-image editing to preserve the current isometric voxel style.
- Process generated PNGs through the existing transparent asset pipeline.
- Keep standard building ids stable so generated art can replace temporary
  manifest sprites without changing progression or saves.

**Notes:**
- Added manifest entries for `workbench`, `tool_rack`, `sawmill`,
  `stone_yard`, and `farm_storage`; these now use selected generated PNGs.
- Unlocked standard buildings now appear in the property palette and can be
  placed without consuming or minting prop inventory.
- Dedicated generated art remains outstanding for the resource/farm/building
  asset set.
- Added a Flux/Flux.2 comparison prompt sheet covering resource nodes, farm
  plot states, standard buildings, and pickaxe upgrade visuals.
- Generated the first local Flux.1 Schnell vs Flux.2 Klein comparison batch
  for 13 assets. Review sheet:
  `tmp/resource-asset-generation/contact-sheet.png`; individual outputs live
  under `tmp/resource-asset-generation/<asset-id>/`.
- Flux.2 comparison outputs looked misconfigured, so the current usable lane is
  Flux.1 Schnell. Added a refinement pass for `farm_plot_empty`,
  `farm_plot_starter_crop`, and pickaxe upgrade variants. Review sheet:
  `tmp/resource-asset-generation/refinement/contact-sheet.png`.
- `farm_plot_empty_v2` and `farm_plot_starter_crop_v2` were accepted as
  better candidates. Pickaxe variants need a standalone UI/marketplace base
  rather than a placeable tile asset. Generated six Flux.1 base candidates at
  `tmp/resource-asset-generation/pickaxe-base-candidates/contact-sheet.png`;
  do not generate reinforced/steel variants until one base is selected.
- Pickaxe base `pickaxe_base_c_threequarter` selected. Generated upgrade
  variants from that exact base at
  `tmp/resource-asset-generation/pickaxe-selected-variants/contact-sheet.png`.
- Plain img2img was rejected because variants stayed identical; adaptor was not
  configured correctly. Added a corrected Flux.2 `ReferenceLatent` edit pass at
  `tmp/resource-asset-generation/pickaxe-flux2-edit-variants/contact-sheet.png`.
  It differentiates material tiers, but still inherits the selected base's small
  support slab, so a cleaner no-slab base may be needed before final export.
- Generated fresh Flux.1 Schnell base candidates for all three tool families:
  pickaxe, woodaxe, and hoe/scythe. Review sheet:
  `tmp/resource-asset-generation/tool-base-candidates/contact-sheet.png`.
- Selected the B-side bases for all three tool families:
  `pickaxe_b_side`, `woodaxe_b_side`, and `hoe_b_side`.
- Expanded the tool asset ladder to six tiers: baseline, reinforced, steel,
  silver, gold, and diamond. Generated a Flux.2 `ReferenceLatent` approval
  sheet at
  `tmp/resource-asset-generation/selected-tool-variants/contact-sheet.png`.
  Once visuals are locked, table cost/yield tuning across CKB, Wood, Stone, and
  Crop.
- Diamond v1 variants were rejected for being too bumpy and bright blue.
  Generated smoother clear-glass diamond v2 comparisons at
  `tmp/resource-asset-generation/tool-diamond-v2/contact-sheet.png`.
- Promoted diamond v2 into the main selected tool ladder sheet and updated the
  generation manifest. Main review sheet:
  `tmp/resource-asset-generation/selected-tool-variants/contact-sheet.png`.
- Expanded live tool progression to six tiers per family and Tool Rack gating to
  level 5. Initial placeholder cost/yield table is documented in
  `docs/superpowers/specs/2026-05-22-tool-family-progression.md`.
- Generated three Flux.1 Schnell candidates each for `workbench`, `tool_rack`,
  `sawmill`, `stone_yard`, and `farm_storage`. Review sheet:
  `tmp/resource-asset-generation/building-candidates/contact-sheet.png`.
- Selected `workbench_c_sturdy`, `tool_rack_b_wall`, `sawmill_c_logs`,
  `stone_yard_c_crane`, and `farm_storage_c_harvest`. Installed transparent
  PNGs into `assets/raw/` and `assets/`, then wired the manifest to the stable
  building asset ids. Transparent preview sheet:
  `tmp/resource-asset-generation/building-candidates/installed/contact-sheet.png`.
- Generated three Flux.1 Schnell candidates each for `harvest_tree`,
  `stone_outcrop`, `gold_nugget_node`, and `farm_plot_ready_crop`. Review sheet:
  `tmp/resource-asset-generation/resource-candidates/contact-sheet.png`.
- Selected `harvest_tree_c_stump`, `stone_outcrop_b_stack`,
  `gold_nugget_node_a_matrix`, and `farm_plot_ready_crop_c_full`. Installed
  transparent PNGs into `assets/raw/` and `assets/`. Worldgen now uses
  `harvest_tree` and `stone_outcrop` for epoch-refreshing local Wood/Stone
  resources. Transparent preview sheet:
  `tmp/resource-asset-generation/resource-candidates/installed/contact-sheet.png`.

Verified with the browser test harness (`285 passed, 0 failed`),
`node netlify-build.mjs`, and `git diff --check`.

## Backlog

### Pickaxe Upgrade Progression

**Status:** covered by `Workbench Recipes + Tool Rack Upgrades`; keep this
only for a later ore-specific mining balance pass.

**Goal:** give players long-term mining/harvesting progression without
over-inflating crypto rewards.

**Acceptance:**
- Add local tool tier state and upgrade recipes.
- Apply conservative modifiers to resource harvesting and/or ore extraction.
- Keep multiplier constants isolated for future economy tuning.

### Economy Pricing Pass

**Goal:** tune mined income, store prices, expansion costs, treasury fee flow,
bank loan offers, farming outputs, crafting costs, and tool upgrade costs into
a coherent early-game economy.

**Acceptance:**
- Capture target time-to-first-purchase, time-to-first-expansion, and loan
  usefulness assumptions.
- Review CKB-denominated store, expansion, and loan constants together.
- Decide whether loan reserve should keep the prototype base reserve or rely
  only on accumulated house treasury fees.
- Include local resource and farm/crafting progression targets.
- Tests update only after pricing targets are recorded.

## Needs Decision

- Property topology: dedicated own-map vs subregion of a shared map.
- First on-chain mining path: real testnet cells vs mock/indexed dev cells.
- Currency model: sUDT per ore, custom typed cells, or hybrid.
- Epoch modifier algorithm and high-value epoch frequency.
- Store integration order: Trader first, General Store first, or wallet inventory first.
- Save-state storage: CKBFS V3 vs custom minimum-capacity state cell.
- Township topology: one communal plane for all players vs owner/epoch-sharded
  township instances.
- House treasury policy: which fees accrue, who controls treasury spending, and
  what can be automated safely.
- Bank chain design: whether the local loan prototype becomes wallet-backed debt
  cells, collateralized positions, or a hybrid.
- Resource model: keep wood/stone/gold as local gameplay materials vs cell-backed
  resources.
- Gold material: separate local crafting material vs reuse the existing
  `gold_ore`/BTC crypto mapping.
- Farm timers: real elapsed time vs epoch-bucketed vs action-count based.
- Crafting unlocks: capability from owned buildings, placed buildings, or both.
- Tool upgrades: which pickaxe effects are safe before economy pricing is tuned.

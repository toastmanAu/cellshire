# Cellshire — Game Design

Status: scope captured 2026-05-15. Mechanics below are the design target;
implementation is at "procgen world + asset pack" stage. Anything marked
**(TBD)** is deliberately left open for future brainstorming.

---

## One-line pitch

A friendly isometric mining game where the map and ore distribution are
driven by CKB on-chain epochs, ores drop real crypto, and every item you
own — props, character skins, ore cells — lives as a CKB cell that you
trade through in-game stores or carry between sessions.

## Why this shape

The combination is the design: procgen is replayable; on-chain epochs make
the procgen *adversarial* (others can mine your veins before you get back);
on-chain props turn cosmetics into a real player economy; open asset
standards mean the community grows the game. Nothing else in crypto-gaming
ships all four together — that's the unique angle to defend.

---

## World

### Per-epoch maps

- One map = one procgen world bounded at ≤ 300 cells/side (engine ceiling
  from spike — see [renderer notes](#renderer-envelope)).
- Each on-chain CKB epoch produces a new map by hashing the epoch's tip
  block hash into the procgen seed.
- All ore locations, biome shapes, water bodies, and ore types reset at
  epoch rollover. Players see "a new shift of the quarry" each cycle.
- Procgen pass produces: terrain biomes (water / sand / dirt / dark stone),
  ore deposits (Poisson-disc on stone), and decorative scatter (trees on
  dirt, etc.).

### Multiple maps per player session

- Rather than one huge seamless world, players move between **multiple
  bounded maps** (mine entrances, regions, surface vs deep).
- Each map = one CKB cell with `{seed, biome_type, epoch, depleted_ores}`.
- Movement between maps is a portal / lift / ferry interaction — UI swap,
  cell swap, fresh render.
- This pattern fits the engine's natural sweet spot (≤ 200 cells/side at
  refresh-rate ceiling) and turns each region into its own tradeable
  cell.

### Renderer envelope

Empirical from spike (see `/iso-mining-spike` history):
- 100×100: refresh-rate ceiling (98–100fps) — sweet spot
- 200×200: refresh-rate ceiling — comfortable
- 300×300: 100fps idle, 40fps panning — playable but pan-bound
- ≥ 400: needs chunked-renderer rewrite (deferred)

---

## Mining

### Ores as CKB cells

- Every ore deposit on the map = one CKB cell.
- Cell data carries `{ ore_type, position, capacity_remaining, owner_lock_if_claimed }`.
- Mining is a CKB transaction that decrements the cell's capacity (or
  destroys it when capacity reaches zero) and credits the player.

### Yield formula

Each mining event drops a **per-ore-type currency** in a randomised range:

```
yield = randomInRange(lo, hi)
lo, hi = bounds_for_ore_type * epoch_modifier
```

- `bounds_for_ore_type` is a static table per ore (coal = low, gold =
  mid, diamond/ckb_cluster = high).
- `epoch_modifier` is derived from the epoch block hash using the 16-bit
  bucket at hash nibbles 8-11. The first 32 bits still drive procgen seed;
  this next word drives yield so map shape and payout tier are separated.
- Tuning constants: bucket < 5% gives `3x` ("Rich shift"), bucket < 20%
  gives `2x` ("High-yield shift"), and all other epochs give `1x`.
- A **"high value" epoch** is any epoch where `epoch_modifier > 1`.
  The HUD surfaces these shifts and local mining yield ranges are
  multiplied before the result is credited.

### Crypto-denominated internal currencies

Mineable deposits present as crypto currencies rather than generic ore
currencies. The current implementation has 12 mineable deposit types mapped
to proof-of-work internal currencies:

| Deposit id         | Deposit display | Currency |
|--------------------|-----------------|----------|
| `gold_ore`         | Gold            | BTC      |
| `silver_ore`       | Silver          | LTC      |
| `diamond_ore`      | Diamond         | DOGE     |
| `cobalt_ore`       | Cobalt          | DASH     |
| `copper_ore`       | Copper          | XMR      |
| `coal_seam`        | Coal            | ZEC      |
| `ckb_cluster`      | CKB Cluster     | CKB      |
| `amethyst_geode`   | Amethyst        | KAS      |
| `iron_ore`         | Iron            | ERG      |
| `silicon_quartz`   | Silicon Quartz  | BCH      |
| `lithium_ore`      | Lithium         | DGB      |
| `bismuth_ore`      | Bismuth         | RVN      |

Target direction:

- The current 12-deposit set is large enough for the first economy table;
  future deposits should be added only when they create a distinct visual,
  rarity, or crypto-economy role.
- Each deposit maps to an internal currency. The visual deposit stays
  ore-like, but HUD, inventory, rewards, and Trader copy speak in the
  crypto symbol/name.
- Internal currencies are not live tokens at first. On testnet they are
  local/game balances with a fixed price snapshot seeded from CoinGecko on
  2026-05-18 at 14:06:32 UTC.
- Per-epoch value snapshots can later be fetched through a price adapter,
  likely CoinGecko first. The adapter should run near the existing epoch
  procgen seed fetch, cache the result by epoch, and fall back to the last
  known or fixed testnet table when offline.
- Mined amount should be value-normalized. Expensive crypto associations
  yield tiny decimal amounts; cheaper associations yield larger amounts.
  The tuning should target a per-hit USD-value band by rarity/tier, then
  compute token amount as `target_usd / epoch_price_usd` before applying
  the epoch modifier.
- Later mainnet path: mint or update real Nervos UDT/sUDT cells
  programmatically for the chosen currencies. Until then, the same
  currency adapter boundary should keep local/testnet balances and real
  UDT issuance interchangeable.

The "real CKB" drip remains the visceral on-chain hook once live issuance
lands: finding a CKB-associated deposit and mining it can eventually credit
actual CKB or a CKB-denominated cell to the wallet. Everything else can
start as internal currency, with on-chain swap routes through the Trader
store later.

### Supply cap + respawn

- Per-epoch supply is finite. The procgen lays N ore cells, miners
  consume them, then **the rest wait until next epoch** for fresh layout.
- Creates a real "claim the vein early" tension and naturally rate-limits
  any speculative farming abuse.
- Players can see when the next epoch rolls (CKB ~ 4-hour epochs on
  mainnet) — adds a rhythm to play sessions.

---

## Economy & on-chain items

### Open asset standard

Anyone can mint **compliant items** on-chain and they appear in Cellshire.
Several unit cell types likely needed:

- **Ground tile cell** — a tile asset for player property zones
- **Prop cell** — decorative or functional placeable object
- **Character skin cell** — sprite/avatar variant
- **Accessory cell** — hat, tool, pet, etc.

Each type has a published **molecule schema + render rules** so the game
knows how to display it. Schemas are versioned; the game uses the latest
compatible.

### Three-store marketplace

| Store          | Inventory                                | Tx type                       |
|----------------|------------------------------------------|-------------------------------|
| **Trader**     | Currency-for-currency swaps              | Atomic swap cells             |
| **General store** | Common items at fixed game-set prices | Buy cell from script vendor   |
| **Marketplace** | Unique player-listed items (NFT-like)   | Listing + buy via swap script |

The Trader is the conversion bridge between in-game currencies (mine coal
→ trader → trade for amethyst crystals → trader → trade for CKB if you
must). The General Store sells the bread-and-butter props from a fixed
catalogue. The Marketplace is the player-to-player layer where rarity and
identity matter.

### Tradable props for real decoration

- Players can buy unique props from the marketplace and place them in
  their property zone.
- Other players visiting the zone see them. Status, expression, identity.
- Props are individually addressable cells — selling one transfers
  ownership atomically.

---

## Player property zone

- Each player starts with a **small base zone** (a fenced region on a
  starter map or their own dedicated map).
- Zone can be **expanded up to a dedicated maximum** — same pattern as
  Hay Day / Township / Stardew property tiers.
- Expansion costs game currency and/or rare items.
- Props placed in the zone are owned and visible to visitors.
- **(TBD)** — whether the property zone is its own map or a subregion of
  a shared map. Trade-off: own-map = better isolation, subregion =
  social/visit-ability.

---

## Gameplay loop

### Character + movement

- Player has a **character avatar** rendered on the map.
- Tile-tap (mobile) / tile-click (desktop) does one of two things:
  1. **Walk to that tile** if it's traversable
  2. **Interact with that tile** if it has an action (ore = mine, prop =
     use, NPC vendor = open shop)
- Pathfinding: A* on the tilemap, blocked by collision tiles.
- Pace: deliberately slow walking animation so each move reads — this is
  a contemplative mining game, not action.

### Collision

- **Props are solid**. Character cannot walk through them — must path
  around.
- Water is non-traversable (unless we add bridges/boats later).
- Ore deposits are non-traversable (you stand next to them to mine).
- Open ground tiles (grass, sand, path, dirt, dark stone) are walkable.

### Character skins + accessories

- Default starter skin per player.
- Marketplace skins + accessories unlock cosmetic variations.
- Held tool affects mining animation (pickaxe vs drill vs whatever).

---

## Save & persistence

**Principle: state lives on-chain by default; "saving" is just one tx.**

The design splits player state into two tiers so that "saving" stays
cheap and the friction stays low:

### Tier 1 — Inherent state (always on-chain, never needs "saving")

Anything that *is* a cell is already saved by virtue of existing. Updates
to these happen through normal game transactions (mining, trading, buying)
which the player has already signed for, so there's no separate save step.

- Currency balances (sUDT-style cells per currency)
- Inventory items (cell per item / NFT cell)
- Placed props in the property zone
- Ore consumption (ore-cell capacity)
- Map seeds + epoch derivations (computed deterministically from chain)
- Character skin selection (which skin-cell is the player's active lock)

When a player buys a prop, mines an ore, or swaps currency — that
transaction *is* the save. There is no separate "save" UI for these.

### Tier 2 — Resume state (off-chain by default, persisted to one state cell)

A small JSON-compact blob the player chooses to "save":

- Current open map
- Camera position / zoom
- Pinned tools, hotbar layout, UI preferences
- Quest / story progress flags (when those exist)
- Last visited NPC, conversation states

This is held in **one per-player state cell** updated via a single
consume-and-recreate tx. The blob is small (< 1 KB) so the cell stays at
the minimum 61 CKB capacity floor; players pay maybe 0.0001 CKB in tx
fees per save.

### When to prompt

- **On game load**: read the player's state cell, restore resume state.
  No prompt — happens silently. If no state cell exists, start fresh.
- **On significant changes**: after moving to a new map, after buying an
  expansion tier, after completing a quest milestone — show a one-tap
  "Save?" toast for ~5 seconds. Single tap commits, ignore lets the
  player continue with the change unsaved.
- **On exit**: explicit "Save and exit" / "Discard and exit" choice.
- **Auto-save toggle**: opt-in setting that pushes a save tx after every
  significant action without prompting. JoyID requires a redirect per
  signature so auto-save UX needs careful tuning — likely batch every
  N actions or every M minutes rather than every single delta.

### Streamlining

- **One-tap save**: pre-construct the tx in the background; tap triggers
  the JoyID signature flow with the tx ready to go.
- **Pending-save badge**: small indicator showing unsaved-resume-state
  exists; counts changes since last save. Like the orange dot on a
  document title bar.
- **No save loops**: never block the player on a pending save. If they
  refuse / cancel, just continue with current state in-memory.
- **State-cell ownership**: lock the state cell with the player's JoyID
  lock so only they can update it. Anyone can read it (it's chain-public).
- **Recovery**: if the state cell is corrupted or missing, the game
  reconstructs as much as possible from the inherent on-chain state
  (inventory, balances, props) and starts the player on the default map.

### What this gives the design

Because Tier 1 is on-chain by default, **you literally cannot lose your
inventory, currencies, or items** even if the resume cell is gone — they're
real cells in your wallet. The only thing a missing save costs is "where
the camera was last looking", which is recoverable in seconds. That's a
much friendlier failure mode than typical Web3 games where losing the
session means losing the run.

---

## Aesthetic & art direction

- **Style fingerprint**: Minecraft-style voxel cubes rendered as iso-2D
  PNGs. Each tile a thick slab of distinct cubes with visible side
  strata. Asset pack generated via HiDream-O1 with reference-image
  conditioning from the Mykonos source pack — see
  [ASSET-PROMPTS.md](ASSET-PROMPTS.md) for the recipe.
- **Mood**: rugged mountain mining quarry; soft cinematic lighting;
  readable silhouettes; chunky pixel-cube faces.
- **Magic items break the cube convention** deliberately — geodes have
  faceted crystal points, `ckb_cluster` has crystal bursts + inner glow.
  This visual hierarchy (cube = ordinary, faceted = rare/magic) is a
  design feature, not an inconsistency.

---

## Open questions parked for later

These are deliberately deferred:

1. **Epoch modifier algorithm** — how `epoch_modifier` and "high value
   epochs" are derived from on-chain values.
2. **Currency table** — which tokens each ore drops; whether they're
   typed cells, sUDT, or something custom.
3. **Open asset schema** — molecule layout + render-rule format for
   community-minted items.
4. **Property zone topology** — own-map vs subregion.
5. **Multiplayer presence** — can players see each other walking? Snapshot
   sync vs real-time channel updates? (Fiber as the obvious answer.)
6. **Anti-grief on shared resources** — first-come-first-served creates
   real tension but also "rich get richer" dynamics. Mining cooldowns
   per player per ore type may be needed.
7. **Save/load** — local cache versus pull-from-chain on every session.
8. **Mobile vs desktop primary** — mobile-friendly already from upstream
   engine; do we ship as PWA, Capacitor app, or both?

---

## Tech foundation (locked)

- **Renderer**: forked + adapted from Mykonos. Vanilla ES modules, no
  bundler. Layered canvas-2D cache with version-counter invalidation.
- **Procgen**: `src/worldgen/procgen.js` — two-octave seeded value noise
  + Poisson-disc ore scatter. Deterministic per seed.
- **Asset pipeline**: `tools/process_assets.py` trims raw RGBA PNGs and
  installs into `assets/`. Drop new tiles into `assets/raw_pending/`
  then add a one-line `assetManifest.js` entry.
- **Asset gen**: Wyltek Studio's HiDream-O1 worker (port 9092) via the
  `/render/edit` endpoint with reference-image conditioning. See
  [ASSET-PROMPTS.md](ASSET-PROMPTS.md).

## CKB foundation (planned, not yet wired)

- **CCC** (`@ckb-ccc/core`) for tx construction.
- **JoyID** for player wallet auth (sign-message redirect flow).
- **CKBFS V3** for map seed + state snapshots (if needed).
- **Spore** for marketplace NFT items (already in Phill's stack via
  `ckb-dob-minter`).
- **Cellswap** rails for the Trader and Marketplace store backends.
- **Fiber** (later) for low-latency in-game payments and multiplayer
  presence sync.
